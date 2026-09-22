import logging

from .config import settings

logging.basicConfig(
    level=logging.INFO if settings.log_level == "INFO" else logging.DEBUG
)
