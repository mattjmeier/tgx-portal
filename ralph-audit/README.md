# Ralph Build Loop for `tgx-portal`

This is a PRD-driven implementation loop for this repository.

## What Changed from the Audit Version

- The original read-only audit idea has been repurposed into a build loop.
- The loop reads stories directly from `.taskmaster/docs/prd.md`.
- Each PRD `### Story N:` section becomes one implementation task.
- Codex runs with write access instead of read-only mode.
- Story completion is controlled by the agent's final status message.

## Loose Mode

This version defaults to an early-development completion rule:

- a story is marked complete when the agent finishes with `STATUS: DONE`
- full automated verification is encouraged but not required
- if the agent ends with `STATUS: BLOCKED`, the story is left incomplete

This is useful while scaffolding features, infrastructure, and tests are still in flux.

## Directus-Specific Expectation

For Directus schema/setup work, the preferred path is:

1. create or bootstrap schema using Directus-supported APIs or Data Studio
2. verify the schema exists in a running Directus instance
3. export a real Directus snapshot
4. use that exported snapshot as the repeatable baseline

The loop should not treat hand-authored or speculative snapshot YAML as a proven migration artifact.

Current working baseline and helpers in this repo:

- real replayable baseline: `directus/snapshots/baseline-story-001.yaml`
- STORY-002 live bootstrap: `directus/bootstrap/bootstrap_story_002.py`
- STORY-003 live bootstrap: `directus/bootstrap/bootstrap_story_003.py`
- repeatable sample dataset: `directus/seed/sample_project.json`
- seeded-data loader: `directus/seed/load_sample_project.py`

In practice, this means a strong Directus cycle often looks like:

1. apply or update the live Directus change
2. verify the change in the running app/API
3. load the sample project fixture when story behavior depends on real records
4. export a new real snapshot only when the resulting state should become a durable baseline

For Directus-heavy stories, the agent is expected to report a structured `DIRECTUS CHECK` outcome:

- `applied-live`
- `baseline-exported`
- `blueprint-only`
- `not-applicable`

The runner will not mark a Directus-heavy story complete if the response ends in `STATUS: DONE` but the Directus outcome is only `blueprint-only` or missing.

## What It Does

Each iteration:

1. Parses `.taskmaster/docs/prd.md`
2. Picks the next unfinished PRD story
3. Builds a prompt from that story plus [`CODEX.md`](/home/mmeier/shared2/projects/tgx-portal/ralph-audit/CODEX.md)
4. Runs `codex exec` in workspace-write mode
5. Captures only the final model message
6. Writes that final message into `ralph-audit/results/*.md`
7. Marks the story passed or leaves it pending based on the returned status

## Prerequisites

- `codex` on your `PATH` and authenticated
- `python3`
- `bash`

## Usage

From the repo root:

```bash
cd ralph-audit
./ralph.sh 10
```

Disable web research:

```bash
./ralph.sh 10 --no-search
```

Use a different PRD path:

```bash
PRD_FILE=/path/to/prd.md ./ralph.sh 10
```

## Files

- `ralph.sh`: main runner
- `parse_prd.py`: extracts markdown PRD stories and maintains local runner state
- `CODEX.md`: implementation instructions for the Codex loop
- `progress.txt`: generated checklist for story progress
- `status-summary.md`: generated story-to-PRD status map
- `results/*.md`: final per-story completion summaries from the agent
- `state.json`: generated local pass/fail state

## Notes

- The source of truth remains `.taskmaster/docs/prd.md`.
- Runner state is stored separately in `ralph-audit/state.json`.
- Output filenames are derived from PRD story numbers and titles, for example `results/01-collaborator-project-intake.md`.
- The current default is intentionally loose, but Directus-heavy stories now still require an explicit live-vs-blueprint outcome.
- The seeded Golden Sample Project is now part of the recommended verification toolkit for stories touching projects, studies, samples, assays, plating, intake uploads, or permission-scoped content views.
