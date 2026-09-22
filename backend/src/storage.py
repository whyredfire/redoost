import aioboto3
from aiobotocore.config import AioConfig

from .config import Settings


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.s3_bucket
        self.settings = settings
        self.session = aioboto3.Session()

    async def check_connection(self) -> None:
        async with self.session.client(  # pyright: ignore[reportGeneralTypeIssues]
            "s3",
            endpoint_url=str(self.settings.s3_endpoint),
            region_name=self.settings.s3_region,
            aws_access_key_id=self.settings.s3_access_key_id,
            aws_secret_access_key=self.settings.s3_secret_access_key.get_secret_value(),
            config=AioConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        ) as client:
            await client.head_bucket(Bucket=self.bucket)
