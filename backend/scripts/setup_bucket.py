import asyncio
import logging

from src.config import settings
from src.storage import client

# Nginx serves published sites from the bucket's website endpoint
website = {"IndexDocument": {"Suffix": "index.html"}}

# Browsers upload straight to the bucket from the frontend
cors = {
    "CORSRules": [
        {
            "AllowedOrigins": [settings.app_origin],
            "AllowedMethods": ["POST"],
            "AllowedHeaders": ["*"],
        }
    ]
}


async def setup_bucket() -> None:
    bucket = settings.s3_bucket
    async with client(settings.s3_endpoint) as s3:
        await asyncio.gather(
            s3.put_bucket_website(Bucket=bucket, WebsiteConfiguration=website),
            s3.put_bucket_cors(Bucket=bucket, CORSConfiguration=cors),
        )
    logging.getLogger(__name__).info("Configured bucket %s", bucket)


if __name__ == "__main__":
    asyncio.run(setup_bucket())
