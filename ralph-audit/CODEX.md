# Ralph Build Agent Instructions for `tgx-portal`

You are an autonomous implementation agent. Your job is to complete the current PRD story by making code and configuration changes in this repository.

## Working Mode

- You may modify files in the repository.
- Prefer implementing the story directly over writing plans.
- Use the PRD story as the main scope boundary.
- Use `AGENTS.md` and `docs/*.md` as architectural constraints and source of truth.

## Project Direction

This repository is a Directus-first rebuild exploration for the R-ODAF portal.

You must prefer:

- Directus collections, roles, permissions, and flows
- Directus extensions before a separate frontend
- minimal custom code
- container-first development

Do not rebuild a large custom backend when Directus-native mechanisms fit the requirement.

## Directus Bootstrapping Guardrails

When working on Directus schema/setup tasks:

- Do not hand-author speculative Directus snapshots and treat them as executable migrations.
- For initial schema bootstrapping, use Directus-supported mechanisms only:
  - Directus Data Studio
  - official Directus system APIs
  - Directus SDK / services / supported CLI workflows
- A snapshot is only considered authoritative if it was exported from a real running Directus instance.
- If you create schema artifacts from requirements documents, present them as blueprints, not as proven importable snapshots.

Current repo reality:

- `directus/snapshots/baseline-story-001.yaml` is the first real exported Directus baseline and should be treated as authoritative for STORY-001 replay.
- `directus/snapshots/01-04-*.yaml` are still useful design blueprints, but they are not automatically authoritative migration artifacts.
- STORY-002 and STORY-003 now also have supported live bootstrap paths:
  - `directus/bootstrap/bootstrap_story_002.py`
  - `directus/bootstrap/bootstrap_story_003.py`
- There is a repeatable non-production verification dataset:
  - `directus/seed/sample_project.json`
  - `directus/seed/load_sample_project.py`

When a Directus-heavy story changes live schema, permissions, or workflow behavior, prefer this sequence:

1. apply/bootstrap the change against a running Directus instance
2. verify the change live
3. load or re-load the seeded sample project when it helps verify the behavior
4. export a real snapshot if the resulting state should become a new baseline

Do not ignore the seeded sample project during verification when it is relevant to the story.
If a story affects intake, hierarchy navigation, permissions, or export behavior, use the seeded dataset as a default smoke-test target unless there is a better story-specific fixture.

## Execution Expectations

For the current story:

1. Inspect the relevant repo files and docs.
2. Implement the story directly in the repository.
3. Run lightweight verification when practical.
4. End with a concise final message that includes:

```text
STATUS: DONE
SUMMARY:
- ...

PRD CHECK:
- Story: ...
- Acceptance: met | partially met | blocked

DIRECTUS CHECK:
- Outcome: applied-live | baseline-exported | blueprint-only | not-applicable
- Evidence: ...

VERIFICATION:
- Ran ...
- Could not run ...

FILES:
- path/to/file
```

If you are truly blocked and cannot make meaningful forward progress, end with:

```text
STATUS: BLOCKED
REASON:
- ...
NEEDS:
- ...
```

## Loose Completion Rule

This loop is running in an initial-development mode.

- `STATUS: DONE` means the runner may mark the story complete even if verification is partial or unavailable.
- You should still run sensible checks when they are cheap and local.
- If tests are missing, infrastructure is incomplete, or the feature is only partially verifiable, say that clearly in `VERIFICATION`.
- If the task depends on Directus schema, collections, permissions, or extension bootstrapping, include a `DIRECTUS CHECK` block.
- If the task benefits from seeded data verification, mention whether you used `directus/seed/load_sample_project.py` or why you did not.
- Use `Outcome: applied-live` only if the change was verified against a running Directus instance.
- Use `Outcome: baseline-exported` only if a real snapshot was exported from a running Directus instance after applying the schema.
- Use `Outcome: blueprint-only` if the work produced design artifacts or code scaffolding but was not applied live.
- If the result is `blueprint-only`, do not claim the bootstrapping path is complete.

## Quality Bar

- Keep changes scoped to the story when possible.
- Do not revert unrelated user changes.
- Preserve existing project patterns unless the PRD or docs require a shift.
- Make partial but real progress rather than stopping early.

## Repo-Specific Guidance

Use these docs when relevant:

- `docs/01-DATABASE_SCHEMA.md`
- `docs/02-API_AND_INTEGRATIONS.md`
- `docs/03-UI_UX_REQUIREMENTS.md`
- `docs/04-PIPELINE_CONFIG_MAPPING.md`
- `docs/05-DEVOPS_AND_TESTING.md`

Also respect:

- `AGENTS.md`
- `.taskmaster/docs/prd.md`

## Important Reminders

- Do not output a report-only audit.
- Do not stop at analysis if implementation is possible.
- Be explicit about what changed and what remains unverifiable.
- If `schema apply` fails on a fresh Directus instance, do not claim the schema bootstrapping path is complete.
- If the seeded sample project exposes a mismatch between docs and live schema, update the implementation or verification notes accordingly instead of hand-waving it away.
