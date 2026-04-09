# Ralph Status Summary
Generated: 2026-04-08T22:33:41Z

## PRD Mapping
### TASK-001: Refactor sidebar IA around collaborations and studies
- PRD Section: Story 1: Browse collaborations from one obvious home; Story 2: Browse studies in a way that preserves collaboration context; REQ-001; REQ-002
- Acceptance Target: Sidebar exposes `Collaborations` and `Studies` as the main browse model, supports preview/collapse behavior, and no longer depends on duplicated registry/directory links.
- Status: done
- Result File: ralph-loop/results/01-sidebar-ia.md

### TASK-002: Add collaboration index page and server-side table flow
- PRD Section: Story 1: Browse collaborations from one obvious home; REQ-003; REQ-011
- Acceptance Target: A collaboration index page exists, uses server-side table patterns, and provides a clear create action and click-through path.
- Status: done
- Result File: ralph-loop/results/02-collaboration-index.md

### TASK-003: Add explicit study title support and study index grouping
- PRD Section: Story 2: Browse studies in a way that preserves collaboration context; REQ-004; D2
- Acceptance Target: Study title is the primary label in navigation and lists, species/cell line are secondary, and the study index is grouped or context-rich by collaboration.
- Status: done
- Result File: ralph-loop/results/03-study-title-and-index.md

### TASK-004: Restructure study workspace into samples, contrasts, and collaboration info
- PRD Section: Story 3: Open a study into a focused workspace; REQ-005
- Acceptance Target: Opening a study lands on a samples-first workspace with the required tabs and predictable submenu actions.
- Status: done
- Result File: ralph-loop/results/04-study-workspace.md

### TASK-005: Make create flows collaboration-aware and redirect-forward
- PRD Section: Story 4: Create collaboration and study records with forward momentum; REQ-006; D1
- Acceptance Target: Global study create requires collaboration selection first, and both create flows redirect into the new route model with clear success messaging.
- Status: done
- Result File: ralph-loop/results/05-create-flows.md

### TASK-006: Build onboarding wizard shell from the PRD stages
- PRD Section: Story 5: Complete metadata onboarding through a staged wizard; REQ-007
- Acceptance Target: A multi-step wizard exists with clear stage progression, shadcn/ui composition, and route-safe state handling.
- Status: done
- Result File: ralph-loop/results/06-onboarding-shell.md

### TASK-007: Implement lookup-driven template setup and bounded create-or-select behavior
- PRD Section: Story 5: Complete metadata onboarding through a staged wizard; Story 6: Reuse controlled values without losing flexibility; REQ-008; REQ-013; D3
- Acceptance Target: Template setup supports required and optional fields, bounded custom metadata definitions, and the hybrid lookup policy for inline value creation.
- Status: done
- Result File: ralph-loop/results/07-template-and-lookups.md

### TASK-008: Implement metadata upload preview and aggregate validation
- PRD Section: Story 5: Complete metadata onboarding through a staged wizard; REQ-009
- Acceptance Target: Users can upload CSV/TSV metadata, preview it, and receive user-readable row/cell validation feedback with aggregated errors.
- Status: done
- Result File: ralph-loop/results/08-upload-validation.md

### TASK-009: Implement mapping, contrast suggestion, and draft/final gating
- PRD Section: Story 5: Complete metadata onboarding through a staged wizard; REQ-010; D4
- Acceptance Target: Mapping options come from uploaded metadata, draft save works before final validity, suggested contrasts are reviewable, and final generation remains validation-gated.
- Status: done
- Result File: ralph-loop/results/09-mapping-and-contrasts.md

### TASK-010: Add deterministic seed data, reset flow, and end-to-end test hardening
- PRD Section: Story 7: Validate and test against realistic seeded data; REQ-012
- Acceptance Target: Two collaborations with three studies each can be seeded through a documented reset flow, and the main UX journeys are covered by container-first tests.
- Status: done
- Result File: ralph-loop/results/10-seeds-and-tests.md
