import logging

from .config import settings

verbose = settings.log_level == "VERBOSE"
logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO)
# Disable logging for health endpoint
logging.getLogger("uvicorn.access").addFilter(
    lambda record: " /health " not in record.getMessage()
)
# Requests to the sign-in provider are only logged when verbose
if not verbose:
    logging.getLogger("httpx2").setLevel(logging.WARNING)
