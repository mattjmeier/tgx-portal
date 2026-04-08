# tgx-portal — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**tgx-portal** is a python project built with django.

## Scale

4 API routes · 1 middleware layers · 11 environment variables

## Subsystems

- **[Admin](./admin.md)** — 1 routes
- **[Urls](./urls.md)** — 1 routes
- **[Infra](./infra.md)** — 2 routes — touches: auth

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `frontend/src/api/projects.ts` — imported by **12** files
- `frontend/src/api/samples.ts` — imported by **9** files
- `/models.py` — imported by **7** files
- `frontend/src/auth/AuthProvider.tsx` — imported by **7** files
- `frontend/src/api/http.ts` — imported by **7** files
- `frontend/src/components/ui/button.tsx` — imported by **4** files

## Required Environment Variables

- `CELERY_BROKER_URL` — `backend/config/settings.py`
- `CELERY_TASK_ALWAYS_EAGER` — `backend/config/settings.py`
- `DATABASE_HOST` — `backend/config/settings.py`
- `DATABASE_NAME` — `backend/config/settings.py`
- `DATABASE_PASSWORD` — `backend/config/settings.py`
- `DATABASE_PORT` — `backend/config/settings.py`
- `DATABASE_USER` — `backend/config/settings.py`
- `DJANGO_ALLOWED_HOSTS` — `backend/config/settings.py`
- `DJANGO_DEBUG` — `backend/config/settings.py`
- `DJANGO_SECRET_KEY` — `backend/config/settings.py`
- `VITE_API_BASE_URL` — `frontend/src/api/assays.ts`

---
_Back to [index.md](./index.md) · Generated 2026-04-08_