# DevOps, Containerization & Testing

## 1. Docker Architecture
The project uses `docker-compose.yml` (for local development) and `docker-compose.prod.yml` (for the production VM). 

### Services Required:
1. **`db`**: PostgreSQL 15.
2. **`redis`**: Redis (Message broker for Celery and caching).
3. **`api`**: Django backend. 
   * *Dev*: Runs via `python manage.py runserver`, mounts local volume for hot-reloading.
   * *Prod*: Runs via `gunicorn`.
4. **`worker`**: Celery worker running the Django app context (for background tasks like Plane API calls and config generation).
5. **`frontend`**: React application.
   * *Dev*: Runs Vite dev server on port 5173 with hot-Module-Reloading (HMR).
   * *Prod*: Multi-stage build. Builds static files, served via an `nginx` container on port 80/443.
   * Frontend container images must include the dependencies needed for `shadcn/ui`-based components and any generated files under `frontend/src/components/ui`.

## 1.1 Local Startup Behavior
The development `api` container already runs the following on startup before launching Django:

```bash
python manage.py migrate
python manage.py bootstrap_dev_user
python manage.py runserver 0.0.0.0:8000
```

That means a normal `docker compose up` should:
- apply any pending migrations,
- ensure the default development users exist,
- start the API in a login-ready state.

Default local credentials:
- `admin / admin123` (Django superuser and portal Admin role)
- `client / client123`

The Django admin explorer is available at `http://localhost:8003/admin/`. Use it as the preferred short-term browser for backend-only warehouse models in `chemicals` and `profiling`, including study data resources and import provenance records.

This automation reduces startup drift, but it does not replace safe migration design. If a migration introduces a new constraint, the migration must still handle legacy rows that might violate it.

## 2. Testing Frameworks
* **Backend (Django/Python)**: Use `pytest` and `pytest-django`. Use `factory_boy` for generating mock database records (Projects, Samples, Assays).
* **Frontend (React)**: Use `Vitest` and `React Testing Library` for component unit tests.
  * Tests should cover local wrappers and feature components built on top of `shadcn/ui`, especially form behavior, dialogs, menus, and role-sensitive UI states.
* **End-to-End (E2E)**: Use `Playwright`. E2E tests should spin up the entire Docker stack, navigate to the React intake form, upload a mock `.csv` sample sheet, submit the form, and verify that the database updated and the Snakemake config was generated.

## 3. GitHub Actions (CI/CD) Workflow
The `.github/workflows/ci.yml` must execute the following jobs on every Pull Request to `main`:
1. **Linting**: Run `ruff` (Python) and `eslint` (React).
2. **Backend Tests**: Build the `db`, `redis`, and `api` containers. Run `docker compose exec api pytest`.
3. **Frontend Tests**: Run `npm run test` (Vitest).
4. **E2E Tests**: Spin up the full Docker stack. Run Playwright against `localhost`. Upload artifacts (Playwright traces/videos) if tests fail to aid debugging.

## 4. Seeded QA Reset Flow
Use the deterministic mock seed when you need a clean collaboration/study workspace for manual QA or demos.

If the stack is already running:

```bash
docker compose exec api python manage.py reset_seed_data
```

If the API container is not running yet, use:

```bash
docker compose run --rm api python manage.py reset_seed_data
```

This command preserves users and lookup definitions, but replaces the current project hierarchy with:
- 4 collaborations
- 3 studies per collaboration
- seeded samples, assays, and finalized onboarding states
- one linked warehouse demo set across `ChemicalSample`, `ProfilingPlatform`, `StudyWarehouseMetadata`, `StudyDataResource`, `ImportBatch`, `Series`, `Metric`, `Pod`, `HTTrWell`, and `HTTrSeriesWell`

The seeded records are mock QA fixtures inspired by the examples in `mocks/metadata.csv`, `mocks/contrasts.txt`, and `mocks/config.yaml`, adapted to the fields currently stored by the Django app.

## 5. Development Schema Workflow
When changing Django models, treat the database lifecycle as part of the feature work.

Recommended loop:

```bash
docker compose run --rm api python manage.py makemigrations
docker compose run --rm api python manage.py migrate
docker compose run --rm api python manage.py reset_seed_data
```

Use `reset_seed_data` after schema changes whenever you want a deterministic local workspace for manual QA. Do not assume ad hoc local rows will survive refactors cleanly.

Before pushing schema work, verify:
- migrations apply cleanly to an existing local database,
- reset seed still succeeds,
- tests covering the changed model and API flow still pass.

For raw PostgreSQL inspection, the local database is exposed on port `5433`:

```bash
psql postgresql://tgx_portal:tgx_portal@localhost:5433/tgx_portal
```

pgAdmin, DBeaver, and TablePlus can use the same connection details. They are useful for raw table/schema inspection, but Django admin is preferred when reviewing model-level relationships and admin-managed reference data.

## 6. Recovery Checklist For Local Drift
If the app suddenly behaves inconsistently after pulling code or switching branches, use this order:

1. `docker compose up` or `docker compose up -d`
2. `docker compose run --rm api python manage.py migrate`
3. `docker compose run --rm api python manage.py bootstrap_dev_user`
4. `docker compose run --rm api python manage.py reset_seed_data`

Use `docker compose down` followed by `docker compose up` when containers are stale or a service command has changed, but treat that as runtime cleanup, not as the primary database fix.
