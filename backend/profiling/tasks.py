import logging

from celery import shared_task

from .data_exports import build_data_export


logger = logging.getLogger(__name__)


@shared_task
def build_data_export_task(export_id: int) -> None:
    try:
        build_data_export(export_id)
    except Exception:
        logger.exception("Data export %s failed.", export_id)

