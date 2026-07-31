# Read-Only Study Archive Import and Database Recovery

## Operating model

The study archive is the replayable source of truth. It is mounted read-only at
`/data`; PostgreSQL stores the searchable catalog, stable keys, and coarse import
history. Counts and FASTQs remain external files. The backup volume is mounted
read-write at `/backups` only in the worker and dedicated backup service.

Set these host paths before starting the stack:

```bash
export STUDY_ARCHIVE_HOST_PATH=/institution/archive
export DATABASE_BACKUP_HOST_PATH=/institution/portal-backups
export DATA_EXPORT_HOST_PATH=/institution/portal-data-exports
```

Production also requires `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, and
`DATABASE_PASSWORD`. Validate the rendered configuration before deployment:

```bash
docker compose -f docker-compose.prod.yml config
```

## Descriptor versions 1 and 2

Every curated directory must contain `portal-study.yaml`. See
[`examples/portal-study.yaml`](examples/portal-study.yaml) and
[`examples/fastq-manifest.tsv`](examples/fastq-manifest.tsv).

Important contracts:

- `study_key` is the immutable, globally unique warehouse study key.
- `collaboration.key` is the immutable parent key used to rebuild a project in
  an empty database.
- Artifact `key` values are stable within the study.
- Version 2 count artifacts require `matrix` compatibility metadata: value
  type, feature identifier kind, annotation source, and annotation version.
  Version 1 remains replayable but its count matrix stays pending until curated.
- Artifact paths may be absolute beneath `/data` or relative to the descriptor.
- Paths and symlinks resolving outside `/data` are rejected.
- If `artifacts` is omitted or empty, conventional metadata, contrasts, config,
  count, and FASTQ-manifest filenames are discovered.
- `inventory` permits no metadata. `metadata_curated` and `lineage_curated`
  require a metadata artifact.
- `sample_column_map` maps a count-matrix column to one sample ID or to a list
  of sample IDs for a deliberately collapsed column.
- `input_resource_keys` declares lineage. The importer never derives count
  lineage from filenames.

The count importer hashes the file and streams only its header. It validates
sample-column relationships without loading the matrix into memory.

The FASTQ manifest supports one row per file or chunk. Required columns are
`file_key` and `path`; supported optional columns are `sample_ID`,
`library_key`, `run_id`, `flowcell_id`, `instrument_name`, `date_run`, `lane`,
`read_role`, `chunk`, `checksum_algorithm`, `checksum`, `evidence`, and `notes`.
Blank sample/library/run values represent unknown lineage.

## Pilot workflow

Start with the three planned pilots: a complete recent study, a legacy study,
and a difficult multi-run study.

Run a read-only validation and diff:

```bash
docker compose run --rm api \
  python manage.py import_study_catalog /data/studies/pilot-study
```

Use `--json` for a durable machine-readable report. A directory is scanned for
`portal-study.yaml` in deterministic path order:

```bash
docker compose run --rm api \
  python manage.py import_study_catalog /data/studies --json
```

Apply one descriptor:

```bash
docker compose run --rm api \
  python manage.py import_study_catalog \
  /data/studies/pilot-study/portal-study.yaml --apply
```

Applying a directory processes each study in its own transaction and creates a
pre-import backup. A failed study retains a failed audit and can optionally
allow later studies to continue:

```bash
docker compose run --rm worker \
  python manage.py import_study_catalog /data/studies \
  --apply --continue-on-error --json
```

The worker is used here because it has write access to `/backups`. `--skip-backup`
exists for controlled testing, but is not recommended for a production
multi-study import.

Replay behavior:

- identical descriptor and artifact digests create a `no_changes` audit;
- declared fields and records are updated;
- records omitted by a revision are reported as stale and retained;
- descriptor-managed fields may overwrite manual database edits;
- independent curation notes remain outside descriptor-managed fields.

Admins can run the same preview/apply engine on the Study import page. Django
admin exposes warehouse curation status, lineage completeness, resources,
sequencing files, declared lineage, and import history.

## Backups

Create a custom-format compressed dump:

```bash
docker compose --profile ops run --rm backup
```

The artifact and JSON sidecar are written beneath `/backups`. The sidecar
records its SHA-256, size, PostgreSQL server version, timestamp, encryption
state, and applied Django migrations. Retention keeps 14 daily, 8 weekly, and
12 monthly recovery points.

If the mounted volume is not encrypted, set an `age` recipient:

```bash
export DATABASE_BACKUP_AGE_RECIPIENT=age1...
```

Verification checks the SHA-256, restores into a randomly named disposable
database, verifies Django migration history and representative core
relationships, and drops the disposable database:

```bash
docker compose --profile ops run --rm backup \
  python manage.py database_backup_verify /backups/tgx_portal_TIMESTAMP.dump
```

For encrypted artifacts, mount the identity inside the container and set
`DATABASE_BACKUP_AGE_IDENTITY` to that container path.

The admin Backups page can create, verify, and download artifacts
asynchronously. It intentionally has no live-restore control.

## Nightly schedule

The example systemd units are in `deploy/systemd/`. Install them on the Docker
host, update `WorkingDirectory` and any environment-file location for that
host, then enable the timer:

```bash
systemctl enable --now tgx-portal-backup.timer
systemctl list-timers tgx-portal-backup.timer
```

A Kubernetes or institutional scheduler may invoke the same one-shot Compose
backup service instead.

## Recovery runbook

First verify the selected artifact. Prefer restoration into a new database:

```bash
docker compose --profile ops run --rm backup \
  python manage.py database_restore /backups/selected.dump \
  --target-database tgx_portal_recovery
```

Inspect the recovered database before switching application configuration.

Replacing the active database is a maintenance operation:

1. Record and announce the maintenance window.
2. Stop the API and worker so no connections or jobs can write.
3. Retain and verify the current pre-recovery backup.
4. Run the guarded command from a one-shot backup container:

```bash
docker compose -f docker-compose.prod.yml stop api worker
docker compose -f docker-compose.prod.yml --profile ops run --rm backup \
  python manage.py database_restore /backups/selected.dump \
  --target-database tgx_portal \
  --replace-live --confirm-database tgx_portal
docker compose -f docker-compose.prod.yml up -d api worker
```

5. Check `/api/health/`, Django migrations, project/study/sample counts, recent
   import audits, and representative relationships.
6. Record the artifact SHA-256 and recovery result.

The restore command refuses invalid database names and refuses replacement of
the configured live database unless both the guarded option and exact database
name confirmation are supplied.

## Acceptance checklist

For each pilot, retain the dry-run JSON and verify:

- first application creates the intended parent, study, samples, resources,
  libraries, runs, and FASTQ rows;
- an immediate replay reports `no_changes` without duplication;
- a revised descriptor updates declared fields and only reports omitted rows as
  stale;
- a backup verifies successfully;
- the catalog can be rebuilt by importing all three descriptors into an empty,
  migrated database.
