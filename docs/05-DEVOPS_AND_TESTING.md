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
