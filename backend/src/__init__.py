import logging

from .config import settings

logging.basicConfig(
    level=logging.INFO if settings.log_level == "INFO" else logging.DEBUG
)
# Disable logging for health endpoint
logging.getLogger("uvicorn.access").addFilter(
    lambda record: " /health " not in record.getMessage()
)
# Requests to the sign-in provider are only logged when verbose
if settings.log_level == "INFO":
    logging.getLogger("httpx2").setLevel(logging.WARNING)
