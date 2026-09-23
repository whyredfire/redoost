import asyncio
import logging

from src.config import settings
from src.storage import client


async def setup_bucket() -> None:
    async with client(settings.s3_endpoint) as s3:
        # Nginx serves published sites from the bucket's website endpoint
        await s3.put_bucket_website(
            Bucket=settings.s3_bucket,
            WebsiteConfiguration={"IndexDocument": {"Suffix": "index.html"}},
        )
        # Browsers upload straight to the bucket from the frontend
        await s3.put_bucket_cors(
            Bucket=settings.s3_bucket,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": [settings.app_origin],
                        "AllowedMethods": ["POST"],
                        "AllowedHeaders": ["*"],
                    }
                ]
            },
        )
    logging.getLogger(__name__).info("Configured bucket %s", settings.s3_bucket)


if __name__ == "__main__":
    asyncio.run(setup_bucket())
