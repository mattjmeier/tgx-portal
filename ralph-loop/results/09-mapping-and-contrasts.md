STATUS: DONE

SUMMARY:
- Backend: added `StudyOnboardingState` with explicit `draft` vs `final` status, persisted mappings (`treatment_level_1..5`, `batch`, optional PCA/report grouping vars), and contrast suggestion/selection.
- Backend: `POST /api/metadata-validation/` now returns `columns` + `suggested_contrasts` and saves them for the study; `POST /api/projects/:id/generate-config/` is blocked until all studies are finalized + mapping-valid.
- Frontend: Mappings stage now derives mapping options from uploaded metadata, supports “Save draft” pre-validity, shows reviewable suggested contrasts, and only enables “Generate outputs” after “Finalize mappings”.

PRD CHECK:
- Section: Story 5: Complete metadata onboarding through a staged wizard; REQ-010; D4
- Acceptance: met

VERIFICATION:
- Ran `docker compose run --rm api pytest -q`
- Ran `docker compose run --rm frontend npm test -- --run`

FILES:
- `ralph-loop/results/09-mapping-and-contrasts.md:1`