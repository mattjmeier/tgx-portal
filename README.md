# tgx-portal

This branch explores a Directus-first rebuild of the R-ODAF metadata portal.

## Stack

* PostgreSQL for storage
* Directus as the data platform and admin interface
* React + Vite for the custom collaborator-facing frontend

## Quick Start

1. Copy `.env.example` to `.env`
2. Start the stack with `docker compose up --build`
3. Open Directus at `http://localhost:8055`
4. Open the frontend at `http://localhost:5173`

## Current Scope

This scaffold is intentionally small. It gives us:

* a runnable container layout
* a place for Directus extensions and schema assets
* a fresh frontend shell for the custom portal

The detailed requirements live in `AGENTS.md` and `docs/`.
