# Plane Stack Bootstrap Notes

This directory is a separate Plane deployment boundary for `tgx-portal`.

## Purpose

- Keep Plane out of the main portal compose stack.
- Let the portal talk to Plane over HTTP/API only.
- Keep Plane traffic on its own proxy port or host name.

## What Lives Here

- `docker-compose.yml`: self-hosted Plane stack using the official `makeplane/*` images.
- This is intentionally isolated from the portal's `docker-compose.yml`.

## What This Stack Contains

- `plane-db`: PostgreSQL for Plane.
- `plane-redis`: cache / queue support.
- `plane-mq`: RabbitMQ for Plane background work.
- `plane-minio`: local object storage for uploads.
- `plane-api`, `plane-worker`, `plane-beat`, `plane-migrator`: backend services.
- `plane-web`, `plane-admin`, `plane-space`, `plane-live`: Plane UI services.
- `plane-proxy`: the only public entry point from this stack.

## How To Run

From this directory:

```bash
docker compose up -d
```

The migrator service is wired as a dependency for the API, so a normal `docker compose up -d` should bootstrap the schema before the app services come online.

## Local Access

- Default exposed HTTP port: `http://localhost:8088`
- Default exposed HTTPS port: `https://localhost:8443` if you configure Plane proxy TLS

If you want a host-level reverse proxy, point it at the `plane-proxy` container and keep the portal and Plane on separate routes or subdomains.
If startup stalls, check `docker compose logs -f plane-migrator` first.

## Portal Integration

- Point the portal's Plane base URL at this stack, not the cloud service.
- Keep Plane auth separate from portal auth.
- Use a service token or API key for backend-to-backend calls from `create_plane_ticket`.
- Add a dedicated portal webhook endpoint if Plane needs callbacks into `tgx-portal`.

## Environment Overrides

These defaults are bootstrap-only and should be overridden before any serious deployment:

- `PLANE_POSTGRES_PASSWORD`
- `PLANE_RABBITMQ_PASSWORD`
- `PLANE_AWS_ACCESS_KEY_ID`
- `PLANE_AWS_SECRET_ACCESS_KEY`
- `PLANE_HTTP_PORT`
- `PLANE_HTTPS_PORT`
- Use [`plane-stack/.env.example`](/home/mmeier/shared2/projects/tgx-portal/plane-stack/.env.example) as the starting point for the local `.env` file.

## Notes

- The compose file uses the current official public Plane images from `makeplane/*` and mirrors the upstream service split.
- If Plane changes image names or startup commands, check the official Plane Docker docs and update this stack before upgrading.
- For the portal side, keep the `create_plane_ticket` Celery task as the integration boundary.

## Official References

- Plane documentation: https://docs.plane.so/
- Plane GitHub repository: https://github.com/makeplane/plane
- Plane community images on Docker Hub: https://hub.docker.com/u/makeplane
