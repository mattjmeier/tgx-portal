#!/bin/bash
# Ralph Build Loop for tgx-portal - PRD-driven implementation runner.

set -euo pipefail

export CODEX_INTERNAL_ORIGINATOR_OVERRIDE="${CODEX_INTERNAL_ORIGINATOR_OVERRIDE:-Codex Desktop}"

MAX_ITERATIONS=10
MAX_ATTEMPTS_PER_STORY="${MAX_ATTEMPTS_PER_STORY:-5}"
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

if [[ "$SKIP_SECURITY" != "true" ]]; then
  echo ""
  echo "==============================================================="
  echo "  Security Pre-Flight Check"
  echo "==============================================================="
  echo ""

  SECURITY_WARNINGS=()

  if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
    SECURITY_WARNINGS+=("AWS_ACCESS_KEY_ID is set - production credentials may be exposed")
  fi

  if [[ -n "${DATABASE_URL:-}" ]]; then
    SECURITY_WARNINGS+=("DATABASE_URL is set - database credentials may be exposed")
  fi

  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    SECURITY_WARNINGS+=("OPENAI_API_KEY is set - runner logs should still be treated as sensitive")
  fi

  if [[ ${#SECURITY_WARNINGS[@]} -gt 0 ]]; then
    echo "WARNING: Potential credential exposure detected:"
    echo ""
    for warning in "${SECURITY_WARNINGS[@]}"; do
      echo "  - $warning"
    done
    echo ""
    echo "Running an autonomous agent with these credentials set could expose"
    echo "them in logs or outbound requests."
    echo ""
    read -r -p "Continue anyway? (y/N) " -n 1
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted. Unset credentials or use --skip-security-check to bypass."
      exit 1
    fi
  else
    echo "No credential exposure risks detected."
  fi
  echo ""
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRD_FILE="${PRD_FILE:-$REPO_ROOT/.taskmaster/docs/prd.md}"
PARSER="$SCRIPT_DIR/parse_prd.py"

RUN_LOG="$SCRIPT_DIR/run.log"
EVENT_LOG="$SCRIPT_DIR/events.log"
MODEL_CHECK_LOG="$SCRIPT_DIR/.model-check.log"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
STATUS_SUMMARY_FILE="$SCRIPT_DIR/status-summary.md"
STATE_FILE="$SCRIPT_DIR/state.json"
ATTEMPTS_FILE="$SCRIPT_DIR/.story-attempts"
LAST_STORY_FILE="$SCRIPT_DIR/.last-story"
COMPLETION_MODE="${COMPLETION_MODE:-loose}"

mkdir -p "$SCRIPT_DIR/results"

if [[ ! -f "$ATTEMPTS_FILE" ]]; then
  echo "{}" > "$ATTEMPTS_FILE"
fi

ts() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

log_event() {
  echo "[$(ts)] $*" >> "$EVENT_LOG"
}

story_current_id() {
  python3 "$PARSER" current-id --prd "$PRD_FILE" --state "$STATE_FILE"
}

story_field() {
  local story_id="$1"
  local field="$2"
  python3 "$PARSER" story-field --prd "$PRD_FILE" --state "$STATE_FILE" --story-id "$story_id" --field "$field"
}

story_markdown() {
  local story_id="$1"
  python3 "$PARSER" story-markdown --prd "$PRD_FILE" --state "$STATE_FILE" --story-id "$story_id"
}

story_mark() {
  local story_id="$1"
  local status="$2"
  local note="${3:-}"
  python3 "$PARSER" mark --prd "$PRD_FILE" --state "$STATE_FILE" --story-id "$story_id" --status "$status" --note "$note"
}

refresh_progress() {
  python3 "$PARSER" write-progress --prd "$PRD_FILE" --state "$STATE_FILE" --output "$PROGRESS_FILE" >/dev/null
  python3 "$PARSER" write-status-summary --prd "$PRD_FILE" --state "$STATE_FILE" --output "$STATUS_SUMMARY_FILE" >/dev/null
}

get_story_attempts() {
  local story_id="$1"
  python3 - "$ATTEMPTS_FILE" "$story_id" <<'PY'
import json, sys
path, story_id = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
print(data.get(story_id, 0))
PY
}

increment_story_attempts() {
  local story_id="$1"
  python3 - "$ATTEMPTS_FILE" "$story_id" <<'PY'
import json, sys
path, story_id = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
data[story_id] = int(data.get(story_id, 0)) + 1
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, sort_keys=True)
    fh.write("\n")
print(data[story_id])
PY
}

mark_story_skipped() {
  local story_id="$1"
  local max_attempts="$2"
  local note="Skipped: exceeded $max_attempts attempts without passing"
  story_mark "$story_id" "skipped" "$note"
  refresh_progress
  echo "Circuit breaker: Marked story $story_id as skipped after $max_attempts attempts"
}

check_circuit_breaker() {
  local story_id="$1"
  local attempts
  attempts=$(get_story_attempts "$story_id")

  if [[ "$attempts" -ge "$MAX_ATTEMPTS_PER_STORY" ]]; then
    echo "Circuit breaker: Story $story_id has reached max attempts ($attempts/$MAX_ATTEMPTS_PER_STORY)"
    mark_story_skipped "$story_id" "$MAX_ATTEMPTS_PER_STORY"
    return 0
  fi
  return 1
}

if [[ ! -f "$PRD_FILE" ]]; then
  echo "ERROR: PRD file not found: $PRD_FILE"
  exit 1
fi

python3 "$PARSER" sync --prd "$PRD_FILE" --state "$STATE_FILE" >/dev/null
refresh_progress

REQUESTED_MODEL="${REQUESTED_MODEL:-gpt-5.4}"
REASONING_EFFORT="${REASONING_EFFORT:-high}"

if [[ -n "${CODEX_MODEL:-}" && "${CODEX_MODEL}" != "$REQUESTED_MODEL" ]]; then
  echo "ERROR: This loop is pinned to CODEX_MODEL=$REQUESTED_MODEL. Unset CODEX_MODEL to continue."
  exit 1
fi

if [[ -n "${CODEX_REASONING_EFFORT:-}" && "${CODEX_REASONING_EFFORT}" != "$REASONING_EFFORT" ]]; then
  echo "ERROR: This loop is pinned to CODEX_REASONING_EFFORT=$REASONING_EFFORT. Unset CODEX_REASONING_EFFORT to continue."
  exit 1
fi

touch "$RUN_LOG" "$EVENT_LOG"

echo "Starting Ralph Build Loop (tgx-portal)"
echo "  PRD: $PRD_FILE"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Max attempts per story: $MAX_ATTEMPTS_PER_STORY"
echo "  Completion mode: $COMPLETION_MODE"
echo "  Model: $REQUESTED_MODEL (reasoning_effort=$REASONING_EFFORT)"
echo "  Logs:"
echo "    - events: $EVENT_LOG"
echo "    - full:   $RUN_LOG"
echo "  Tail:"
echo "    tail -n $TAIL_N -f $EVENT_LOG"
echo "    tail -n $TAIL_N -f $RUN_LOG"

log_event "RUN START max_iterations=$MAX_ITERATIONS max_attempts_per_story=$MAX_ATTEMPTS_PER_STORY completion_mode=$COMPLETION_MODE search=$ENABLE_SEARCH model=$REQUESTED_MODEL reasoning_effort=$REASONING_EFFORT prd=$PRD_FILE"

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
  echo "Fix options:"
  echo "  1) Re-auth with an API key that has access:"
  echo "     printenv OPENAI_API_KEY | codex login --with-api-key"
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

last_message_directus_outcome() {
  local message_file="$1"
  local outcome
  outcome="$(sed -n 's/^- Outcome:[[:space:]]*//p' "$message_file" | head -n 1 | tr 'A-Z' 'a-z')"
  if [[ -z "$outcome" ]]; then
    outcome="$(sed -n 's/^DIRECTUS_STATUS:[[:space:]]*//p' "$message_file" | head -n 1 | tr 'A-Z' 'a-z')"
  fi
  echo "${outcome:-missing}"
}

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Build Iteration $i of $MAX_ITERATIONS"
  echo "==============================================================="

  echo "" >> "$RUN_LOG"
  echo "===============================================================" >> "$RUN_LOG"
  echo "Ralph Build Iteration $i of $MAX_ITERATIONS - $(date)" >> "$RUN_LOG"
  echo "===============================================================" >> "$RUN_LOG"

  log_event "ITERATION START $i/$MAX_ITERATIONS"

  CURRENT_STORY="$(story_current_id)"

  if [[ -z "$CURRENT_STORY" ]]; then
    log_event "RUN COMPLETE (no incomplete stories)"
    echo "No incomplete stories found."
    echo ""
    echo "Ralph build loop completed all tasks!"
    echo "<promise>COMPLETE</promise>"
    exit 0
  fi

  LAST_STORY=""
  if [[ -f "$LAST_STORY_FILE" ]]; then
    LAST_STORY="$(cat "$LAST_STORY_FILE" 2>/dev/null || echo "")"
  fi

  if [[ "$CURRENT_STORY" == "$LAST_STORY" ]]; then
    echo "Consecutive attempt on story: $CURRENT_STORY"
    ATTEMPTS="$(increment_story_attempts "$CURRENT_STORY")"
    echo "Attempts on $CURRENT_STORY: $ATTEMPTS/$MAX_ATTEMPTS_PER_STORY"

    if check_circuit_breaker "$CURRENT_STORY"; then
      echo "Skipping to next story..."
      echo "$CURRENT_STORY" > "$LAST_STORY_FILE"
      sleep 1
      continue
    fi
  else
    ATTEMPTS="$(increment_story_attempts "$CURRENT_STORY")"
    echo "Starting story: $CURRENT_STORY (attempt $ATTEMPTS/$MAX_ATTEMPTS_PER_STORY)"
  fi

  echo "$CURRENT_STORY" > "$LAST_STORY_FILE"

  STORY_TITLE="$(story_field "$CURRENT_STORY" title)"
  STORY_DESC="$(story_field "$CURRENT_STORY" description)"
  STORY_DEPS="$(story_field "$CURRENT_STORY" dependencies)"
  OUT_REL="$(story_field "$CURRENT_STORY" output_relpath)"
  STORY_DIRECTUS_SENSITIVE="$(story_field "$CURRENT_STORY" directus_sensitive)"

  if [[ -z "$OUT_REL" || "$OUT_REL" == "null" ]]; then
    log_event "ERROR story=$CURRENT_STORY could-not-determine-output-path"
    echo "ERROR: Could not determine output path for story $CURRENT_STORY."
    exit 1
  fi

  OUT_FILE="$REPO_ROOT/$OUT_REL"
  mkdir -p "$(dirname "$OUT_FILE")"

  log_event "STORY START id=$CURRENT_STORY attempt=$ATTEMPTS out=$OUT_REL title=$(printf '%s' "$STORY_TITLE" | tr '\n' ' ')"

  PROMPT_FILE="$SCRIPT_DIR/.prompt.md"
  LAST_MESSAGE_FILE="$SCRIPT_DIR/.last-message.md"

  {
    printf -- "# Ralph Build Loop (tgx-portal)\n\n"
    printf -- "Today's date: %s\n\n" "$(date +%Y-%m-%d)"
    printf -- "Current story: %s - %s\n" "$CURRENT_STORY" "$STORY_TITLE"
    printf -- "Target output file (relative to repo root): %s\n\n" "$OUT_REL"
    printf -- "Hard requirements:\n"
    printf -- "- Implement the story directly in the repository.\n"
    printf -- "- Use AGENTS.md and docs/ as constraints.\n"
    printf -- "- End your final response with a machine-readable status line: STATUS: DONE or STATUS: BLOCKED.\n"
    printf -- "- Include a PRD CHECK block.\n"
    printf -- "- If this story touches Directus schema, collections, permissions, flows, or extension bootstrapping, include a DIRECTUS CHECK block with Outcome: applied-live | baseline-exported | blueprint-only | not-applicable.\n"
    printf -- "- Your final response will be saved to %s.\n\n" "$OUT_REL"
    printf -- "Story summary:\n%s\n\n" "$STORY_DESC"
    printf -- "Dependencies:\n%s\n\n" "$STORY_DEPS"
    printf -- "Directus-sensitive story: %s\n\n" "$STORY_DIRECTUS_SENSITIVE"
    printf -- "Story section from the PRD:\n\n"
    story_markdown "$CURRENT_STORY"
    printf -- "\n---\n\n"
    cat "$SCRIPT_DIR/CODEX.md"
  } > "$PROMPT_FILE"

  codex "${CODEX_ARGS[@]}" --output-last-message "$LAST_MESSAGE_FILE" < "$PROMPT_FILE" 2>&1 | tee -a "$RUN_LOG" || true

  if [[ ! -s "$LAST_MESSAGE_FILE" ]]; then
    log_event "ERROR story=$CURRENT_STORY codex-empty-last-message"
    echo "ERROR: Codex did not produce a last message file (or it was empty). See: $RUN_LOG"
    echo "Iteration $i complete (failed). Continuing..."
    sleep 2
    continue
  fi

  cat "$LAST_MESSAGE_FILE" > "$OUT_FILE"
  LAST_STATUS="$(last_message_status "$LAST_MESSAGE_FILE")"
  LAST_DIRECTUS_OUTCOME="$(last_message_directus_outcome "$LAST_MESSAGE_FILE")"

  if [[ "$COMPLETION_MODE" == "loose" ]]; then
    if [[ "$LAST_STATUS" == "DONE" ]]; then
      if [[ "$STORY_DIRECTUS_SENSITIVE" == "True" || "$STORY_DIRECTUS_SENSITIVE" == "true" ]]; then
        if [[ "$LAST_DIRECTUS_OUTCOME" == "blueprint-only" || "$LAST_DIRECTUS_OUTCOME" == "missing" ]]; then
          log_event "STORY INCOMPLETE id=$CURRENT_STORY wrote=$OUT_REL status=$LAST_STATUS directus_outcome=$LAST_DIRECTUS_OUTCOME"
          echo "Directus-sensitive story ended without live/baseline verification; leaving it pending."
          sleep 2
          continue
        fi
      fi
      story_mark "$CURRENT_STORY" "passed"
      refresh_progress
      log_event "STORY COMPLETE id=$CURRENT_STORY wrote=$OUT_REL status=$LAST_STATUS directus_outcome=$LAST_DIRECTUS_OUTCOME"
    else
      log_event "STORY INCOMPLETE id=$CURRENT_STORY wrote=$OUT_REL status=$LAST_STATUS directus_outcome=$LAST_DIRECTUS_OUTCOME"
      echo "Story ended without STATUS: DONE; leaving it pending."
      sleep 2
      continue
    fi
  else
    if [[ "$LAST_STATUS" == "DONE" ]]; then
      story_mark "$CURRENT_STORY" "passed"
      refresh_progress
      log_event "STORY COMPLETE id=$CURRENT_STORY wrote=$OUT_REL status=$LAST_STATUS directus_outcome=$LAST_DIRECTUS_OUTCOME mode=$COMPLETION_MODE"
    else
      log_event "STORY INCOMPLETE id=$CURRENT_STORY wrote=$OUT_REL status=$LAST_STATUS directus_outcome=$LAST_DIRECTUS_OUTCOME mode=$COMPLETION_MODE"
      echo "Story ended without a completion signal; leaving it pending."
      sleep 2
      continue
    fi
  fi

  REMAINING="$(story_current_id)"
  if [[ -z "$REMAINING" ]]; then
    log_event "RUN COMPLETE (all stories passed)"
    echo ""
    echo "All build stories are marked passed."
    echo "Ralph build loop completed all tasks!"
    echo "<promise>COMPLETE</promise>"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Tail log: tail -f $RUN_LOG"
log_event "RUN STOPPED (reached max iterations without completing all tasks)"
exit 1
