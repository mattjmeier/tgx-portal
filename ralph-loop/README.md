# TGX Portal Ralph Loop

This folder is a repo-local adaptation of the `dev-loop-template` for `tgx-portal`.

It is designed to execute against the canonical project PRD at:

- `.taskmaster/docs/prd.md`

The Ralph loop keeps the PRD stable and tracks execution separately through:

- `task-plan.json`: machine-readable queue derived from the PRD
- `state.json`: generated execution state
- `progress.txt`: generated checklist
- `status-summary.md`: generated PRD-facing summary
- `results/*.md`: per-task final agent messages

## Design Choices

- The loop uses the existing PRD instead of copying it again.
- The queue is organized into implementation slices that map to the PRD phases and requirements.
- The agent instructions encode the project rules from `AGENTS.md`, including TDD, Docker-first verification, strict typing, and `shadcn/ui` usage.
- This is a normal folder in the repo, not a nested git repository or submodule.

## Run

From the repository root:

```bash
./ralph-loop/ralph.sh 10
```

Disable search if you want a tighter local-only loop:

```bash
./ralph-loop/ralph.sh 10 --no-search
```

## Defaults

- Repo root: auto-detected from the script location
- PRD: `.taskmaster/docs/prd.md`
- Plan: `ralph-loop/task-plan.json`
- State: `ralph-loop/state.json`

## Task Status Contract

Each task must end with exactly one of:

```text
STATUS: DONE
```

or:

```text
STATUS: BLOCKED
```

If the agent does not end with `STATUS: DONE`, the task remains pending.
