#!/bin/bash
# TGX Portal Ralph loop runner for Codex CLI.

set -euo pipefail

export CODEX_INTERNAL_ORIGINATOR_OVERRIDE="${CODEX_INTERNAL_ORIGINATOR_OVERRIDE:-Codex Desktop}"

MAX_ITERATIONS=10
MAX_ATTEMPTS_PER_TASK="${MAX_ATTEMPTS_PER_TASK:-5}"
SKIP_SECURITY="${SKIP_SECURITY_CHECK:-false}"
ENABLE_SEARCH="true"
TAIL_N="${TAIL_N:-200}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-security-check)
      SKIP_SECURITY="true"
      shift
      ;;
    --search)
      ENABLE_SEARCH="true"
      shift
      ;;
    --no-search)
      ENABLE_SEARCH="false"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
PLAN_FILE="${PLAN_FILE:-$SCRIPT_DIR/task-plan.json}"
PRD_FILE="${PRD_FILE:-$REPO_ROOT/.taskmaster/docs/prd.md}"
STATE_FILE="${STATE_FILE:-$SCRIPT_DIR/state.json}"
PROGRESS_FILE="${PROGRESS_FILE:-$SCRIPT_DIR/progress.txt}"
STATUS_SUMMARY_FILE="${STATUS_SUMMARY_FILE:-$SCRIPT_DIR/status-summary.md}"
PARSER="$SCRIPT_DIR/plan_state.py"
RUN_LOG="$SCRIPT_DIR/run.log"
EVENT_LOG="$SCRIPT_DIR/events.log"
MODEL_CHECK_LOG="$SCRIPT_DIR/.model-check.log"
ATTEMPTS_FILE="$SCRIPT_DIR/.task-attempts"
LAST_TASK_FILE="$SCRIPT_DIR/.last-task"

mkdir -p "$SCRIPT_DIR/results"

if [[ ! -f "$ATTEMPTS_FILE" ]]; then
  echo "{}" > "$ATTEMPTS_FILE"
fi

if [[ "$SKIP_SECURITY" != "true" ]]; then
  echo ""
  echo "==============================================================="
  echo "  Security Pre-Flight Check"
  echo "==============================================================="
  echo ""

  SECURITY_WARNINGS=()
  if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
    SECURITY_WARNINGS+=("AWS_ACCESS_KEY_ID is set")
  fi
  if [[ -n "${DATABASE_URL:-}" ]]; then
    SECURITY_WARNINGS+=("DATABASE_URL is set")
  fi
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    SECURITY_WARNINGS+=("OPENAI_API_KEY is set")
  fi

  if [[ ${#SECURITY_WARNINGS[@]} -gt 0 ]]; then
    echo "WARNING: Potential sensitive environment detected:"
    echo ""
    for warning in "${SECURITY_WARNINGS[@]}"; do
      echo "  - $warning"
    done
    echo ""
    read -r -p "Continue anyway? (y/N) " -n 1
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 1
    fi
  else
    echo "No obvious credential exposure risks detected."
  fi
  echo ""
fi

ts() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

log_event() {
  echo "[$(ts)] $*" >> "$EVENT_LOG"
}

task_current_id() {
  python3 "$PARSER" current-id --plan "$PLAN_FILE" --state "$STATE_FILE"
}

task_field() {
  local task_id="$1"
  local field="$2"
  python3 "$PARSER" task-field --plan "$PLAN_FILE" --state "$STATE_FILE" --task-id "$task_id" --field "$field"
}

task_mark() {
  local task_id="$1"
  local status="$2"
  local note="${3:-}"
  python3 "$PARSER" mark --plan "$PLAN_FILE" --state "$STATE_FILE" --task-id "$task_id" --status "$status" --note "$note"
}

refresh_status() {
  python3 "$PARSER" write-progress --plan "$PLAN_FILE" --state "$STATE_FILE" --output "$PROGRESS_FILE" >/dev/null
  python3 "$PARSER" write-status-summary --plan "$PLAN_FILE" --state "$STATE_FILE" --output "$STATUS_SUMMARY_FILE" >/dev/null
}

get_task_attempts() {
  local task_id="$1"
  python3 - "$ATTEMPTS_FILE" "$task_id" <<'PY'
import json, sys
path, task_id = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
print(data.get(task_id, 0))
PY
}

increment_task_attempts() {
  local task_id="$1"
  python3 - "$ATTEMPTS_FILE" "$task_id" <<'PY'
import json, sys
path, task_id = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
data[task_id] = int(data.get(task_id, 0)) + 1
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, sort_keys=True)
    fh.write("\n")
print(data[task_id])
PY
}

mark_task_skipped() {
  local task_id="$1"
  local note="Skipped after $MAX_ATTEMPTS_PER_TASK failed attempts"
  task_mark "$task_id" "skipped" "$note"
  refresh_status
  echo "Circuit breaker: marked $task_id skipped"
}

last_message_status() {
  local message_file="$1"
  if grep -Eq '^STATUS:[[:space:]]*BLOCKED([[:space:]]*)$' "$message_file"; then
    echo "BLOCKED"
    return 0
  fi
  if grep -Eq '^STATUS:[[:space:]]*DONE([[:space:]]*)$' "$message_file"; then
    echo "DONE"
    return 0
  fi
  echo "UNKNOWN"
}

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "ERROR: plan file not found: $PLAN_FILE"
  exit 1
fi

if [[ ! -f "$PRD_FILE" ]]; then
  echo "ERROR: PRD file not found: $PRD_FILE"
  exit 1
fi

python3 "$PARSER" sync --plan "$PLAN_FILE" --state "$STATE_FILE" >/dev/null
refresh_status

REQUESTED_MODEL="${REQUESTED_MODEL:-gpt-5.2}"
REASONING_EFFORT="${REASONING_EFFORT:-high}"

touch "$RUN_LOG" "$EVENT_LOG"

echo "Starting TGX Portal Ralph Loop"
echo "  Repo root: $REPO_ROOT"
echo "  PRD: $PRD_FILE"
echo "  Plan: $PLAN_FILE"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Max attempts per task: $MAX_ATTEMPTS_PER_TASK"
echo "  Model: $REQUESTED_MODEL (reasoning_effort=$REASONING_EFFORT)"
echo "  Logs:"
echo "    - events: $EVENT_LOG"
echo "    - full:   $RUN_LOG"
echo "  Tail:"
echo "    tail -n $TAIL_N -f $EVENT_LOG"
echo "    tail -n $TAIL_N -f $RUN_LOG"

log_event "RUN START max_iterations=$MAX_ITERATIONS max_attempts_per_task=$MAX_ATTEMPTS_PER_TASK search=$ENABLE_SEARCH model=$REQUESTED_MODEL reasoning_effort=$REASONING_EFFORT"

MODEL_CHECK_CMD=(
  codex
  -a never
  exec
  -C "$REPO_ROOT"
  -m "$REQUESTED_MODEL"
  -c "model_reasoning_effort=\"$REASONING_EFFORT\""
  -s workspace-write
  "Respond with exactly: OK"
)

if ! "${MODEL_CHECK_CMD[@]}" > "$MODEL_CHECK_LOG" 2>&1; then
  echo "ERROR: Model preflight failed for '$REQUESTED_MODEL'. See: $MODEL_CHECK_LOG"
  exit 1
fi

CODEX_ARGS=(-a never)
if [[ "$ENABLE_SEARCH" == "true" ]]; then
  CODEX_ARGS+=(--search)
fi
CODEX_ARGS+=(
  exec
  -C "$REPO_ROOT"
  -m "$REQUESTED_MODEL"
  -c "model_reasoning_effort=\"$REASONING_EFFORT\""
  -s workspace-write
)

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "==============================================================="

  echo "" >> "$RUN_LOG"
  echo "===============================================================" >> "$RUN_LOG"
  echo "Ralph Iteration $i of $MAX_ITERATIONS - $(date)" >> "$RUN_LOG"
  echo "===============================================================" >> "$RUN_LOG"

  log_event "ITERATION START $i/$MAX_ITERATIONS"

  CURRENT_TASK="$(task_current_id)"
  if [[ -z "$CURRENT_TASK" ]]; then
    log_event "RUN COMPLETE"
    echo "No incomplete tasks found."
    echo "<promise>COMPLETE</promise>"
    exit 0
  fi

  LAST_TASK=""
  if [[ -f "$LAST_TASK_FILE" ]]; then
    LAST_TASK="$(cat "$LAST_TASK_FILE" 2>/dev/null || echo "")"
  fi

  if [[ "$CURRENT_TASK" == "$LAST_TASK" ]]; then
    ATTEMPTS="$(increment_task_attempts "$CURRENT_TASK")"
    echo "Repeated task: $CURRENT_TASK ($ATTEMPTS/$MAX_ATTEMPTS_PER_TASK)"
    if [[ "$ATTEMPTS" -ge "$MAX_ATTEMPTS_PER_TASK" ]]; then
      mark_task_skipped "$CURRENT_TASK"
      echo "$CURRENT_TASK" > "$LAST_TASK_FILE"
      sleep 1
      continue
    fi
  else
    ATTEMPTS="$(increment_task_attempts "$CURRENT_TASK")"
    echo "Starting task: $CURRENT_TASK ($ATTEMPTS/$MAX_ATTEMPTS_PER_TASK)"
  fi

  echo "$CURRENT_TASK" > "$LAST_TASK_FILE"

  TASK_TITLE="$(task_field "$CURRENT_TASK" title)"
  TASK_DESC="$(task_field "$CURRENT_TASK" description)"
  TASK_NOTES="$(task_field "$CURRENT_TASK" notes)"
  TASK_PRD_SECTION="$(task_field "$CURRENT_TASK" prd_section)"
  TASK_ACCEPTANCE="$(task_field "$CURRENT_TASK" acceptance)"
  OUT_REL="$(task_field "$CURRENT_TASK" output)"

  if [[ -z "$OUT_REL" || "$OUT_REL" == "null" ]]; then
    echo "ERROR: output path missing for task $CURRENT_TASK"
    exit 1
  fi

  OUT_FILE="$REPO_ROOT/$OUT_REL"
  mkdir -p "$(dirname "$OUT_FILE")"

  PROMPT_FILE="$SCRIPT_DIR/.prompt.md"
  LAST_MESSAGE_FILE="$SCRIPT_DIR/.last-message.md"

  {
    printf -- "# TGX Portal Ralph Loop\n\n"
    printf -- "Today's date: %s\n\n" "$(date +%Y-%m-%d)"
    printf -- "Current task: %s - %s\n" "$CURRENT_TASK" "$TASK_TITLE"
    printf -- "Target output file: %s\n\n" "$OUT_REL"
    printf -- "Hard requirements:\n"
    printf -- "- Implement the task directly in the repository.\n"
    printf -- "- Read the PRD and check your work against the referenced PRD section.\n"
    printf -- "- Follow AGENTS.md and docs/ constraints.\n"
    printf -- "- Preserve shadcn/ui usage for frontend work.\n"
    printf -- "- End with STATUS: DONE or STATUS: BLOCKED.\n\n"
    printf -- "Task description:\n%s\n\n" "$TASK_DESC"
    printf -- "PRD section to satisfy:\n%s\n\n" "$TASK_PRD_SECTION"
    printf -- "Acceptance target:\n%s\n\n" "$TASK_ACCEPTANCE"
    printf -- "Task notes:\n%s\n\n" "$TASK_NOTES"
    printf -- "--- BEGIN PRD ---\n"
    cat "$PRD_FILE"
    printf -- "\n--- END PRD ---\n\n"
    cat "$SCRIPT_DIR/CODEX.md"
  } > "$PROMPT_FILE"

  codex "${CODEX_ARGS[@]}" --output-last-message "$LAST_MESSAGE_FILE" < "$PROMPT_FILE" 2>&1 | tee -a "$RUN_LOG" || true

  if [[ ! -s "$LAST_MESSAGE_FILE" ]]; then
    log_event "ERROR task=$CURRENT_TASK empty-last-message"
    echo "Task produced no final message."
    sleep 2
    continue
  fi

  cat "$LAST_MESSAGE_FILE" > "$OUT_FILE"
  LAST_STATUS="$(last_message_status "$LAST_MESSAGE_FILE")"

  if [[ "$LAST_STATUS" == "DONE" ]]; then
    task_mark "$CURRENT_TASK" "passed"
    refresh_status
    log_event "TASK COMPLETE id=$CURRENT_TASK output=$OUT_REL"
  else
    log_event "TASK INCOMPLETE id=$CURRENT_TASK output=$OUT_REL status=$LAST_STATUS"
    echo "Task did not finish with STATUS: DONE; leaving pending."
    sleep 2
    continue
  fi

  REMAINING="$(task_current_id)"
  if [[ -z "$REMAINING" ]]; then
    log_event "RUN COMPLETE"
    echo "All tasks completed."
    echo "<promise>COMPLETE</promise>"
    exit 0
  fi

  sleep 2
done

echo "Reached max iterations without completing all tasks."
log_event "RUN STOPPED max-iterations"
exit 1
