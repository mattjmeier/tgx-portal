import logging

from django.conf import settings
from celery import shared_task

from .models import PlaneWorkItemSync, Study
from .plane import PlaneConfigurationError, PlaneRequestError, build_plane_work_item_payload, create_plane_work_item

logger = logging.getLogger(__name__)


@shared_task
def sync_study_to_plane(study_id: int) -> None:
    study = Study.objects.select_related("project").filter(id=study_id).first()
    if study is None:
        logger.warning("Skipping Plane work item sync; study %s was not found.", study_id)
        return

    existing_sync = getattr(study, "plane_work_item_sync", None)
    if existing_sync is not None and existing_sync.status == PlaneWorkItemSync.Status.SUCCEEDED:
        logger.info("Skipping Plane work item sync for study %s; sync already succeeded.", study_id)
        return

    sync, _ = PlaneWorkItemSync.objects.get_or_create(study=study)
    sync.status = PlaneWorkItemSync.Status.PENDING
    sync.plane_workspace_slug = str(getattr(settings, "PLANE_WORKSPACE_SLUG", "") or "")
    sync.plane_project_id = str(getattr(settings, "PLANE_PROJECT_ID", "") or "")
    sync.attempt_count += 1
    sync.last_error = ""
    payload = build_plane_work_item_payload(study)
    sync.request_payload = payload
    sync.save(
        update_fields=[
            "status",
            "plane_workspace_slug",
            "plane_project_id",
            "attempt_count",
            "last_error",
            "request_payload",
            "updated_at",
        ]
    )

    try:
        result = create_plane_work_item(study, payload)
    except (PlaneConfigurationError, PlaneRequestError) as exc:
        sync.status = PlaneWorkItemSync.Status.FAILED
        sync.last_error = str(exc)
        response_payload = getattr(exc, "response_payload", None)
        if response_payload is not None:
            sync.response_payload = response_payload
        sync.save(update_fields=["status", "last_error", "response_payload", "updated_at"])
        logger.warning("Plane work item sync failed for study %s: %s", study_id, exc)
        return

    sync.status = PlaneWorkItemSync.Status.SUCCEEDED
    sync.plane_work_item_id = result.work_item_id
    sync.plane_work_item_url = result.work_item_url
    sync.response_payload = result.response_payload
    sync.last_error = ""
    sync.save(
        update_fields=[
            "status",
            "plane_work_item_id",
            "plane_work_item_url",
            "response_payload",
            "last_error",
            "updated_at",
        ]
    )
    logger.info("Created Plane work item %s for study %s.", result.work_item_id, study_id)
