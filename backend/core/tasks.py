import logging

from celery import shared_task

from .models import Project

logger = logging.getLogger(__name__)


@shared_task
def create_plane_ticket(project_id: int) -> None:
    project = Project.objects.filter(id=project_id).first()
    if project is None:
        logger.warning("Skipping Plane ticket creation; project %s was not found.", project_id)
        return

    logger.info("Plane ticket integration placeholder for project %s", project.title)
