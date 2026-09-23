import logging

from .config import settings

logging.basicConfig(
    level=logging.INFO if settings.log_level == "INFO" else logging.DEBUG
)
# Disable logging for health endpoint
logging.getLogger("uvicorn.access").addFilter(
    lambda record: " /health " not in record.getMessage()
)
