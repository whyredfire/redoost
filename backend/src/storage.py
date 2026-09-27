import asyncio
import mimetypes
from typing import Any

import aioboto3
from aiobotocore.config import AioConfig
from pydantic import AnyHttpUrl

from .config import settings
from .models import ManifestFile, UploadPolicy

session = aioboto3.Session()
mime_types = mimetypes.MimeTypes()


def client(endpoint: AnyHttpUrl) -> Any:
    return session.client(
        "s3",
        endpoint_url=str(endpoint),
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        config=AioConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def content_type(path: str) -> str:
    mime_type, encoding = mime_types.guess_file_type(path)
    # Compressed files would otherwise get the MIME type of their contents
    return mime_type if mime_type and not encoding else "application/octet-stream"


async def check_storage() -> None:
    async with client(settings.s3_endpoint) as s3:
        await s3.head_bucket(Bucket=settings.s3_bucket)


async def list_keys(s3: Any, slug: str) -> list[str]:
    keys: list[str] = []
    pages = s3.get_paginator("list_objects_v2").paginate(
        Bucket=settings.s3_bucket, Prefix=f"{slug}/"
    )
    async for page in pages:
        keys.extend(item["Key"] for item in page.get("Contents", []))
    return keys


# Listings leave out checksums, so every object is read on its own
async def read_checksums(slug: str) -> dict[str, str | None]:
    async with client(settings.s3_endpoint) as s3:
        keys = await list_keys(s3, slug)
        heads = await asyncio.gather(
            *(
                s3.head_object(
                    Bucket=settings.s3_bucket, Key=key, ChecksumMode="ENABLED"
                )
                for key in keys
            )
        )
    return {
        key.removeprefix(f"{slug}/"): head.get("ChecksumSHA256")
        for key, head in zip(keys, heads, strict=True)
    }


async def list_slugs() -> list[str]:
    slugs: list[str] = []
    async with client(settings.s3_endpoint) as s3:
        pages = s3.get_paginator("list_objects_v2").paginate(
            Bucket=settings.s3_bucket, Delimiter="/"
        )
        async for page in pages:
            prefixes = page.get("CommonPrefixes", [])
            slugs.extend(prefix["Prefix"].removesuffix("/") for prefix in prefixes)
    return slugs


async def delete_objects(slug: str, paths: list[str] | None = None) -> None:
    async with client(settings.s3_endpoint) as s3:
        # Without paths, every file of the site is deleted
        if paths is None:
            keys = await list_keys(s3, slug)
        else:
            keys = [f"{slug}/{path}" for path in paths]
        # DeleteObjects takes up to 1000 keys at a time
        for start in range(0, len(keys), 1000):
            batch = [{"Key": key} for key in keys[start : start + 1000]]
            result = await s3.delete_objects(
                Bucket=settings.s3_bucket, Delete={"Objects": batch, "Quiet": True}
            )
            # Failures for individual keys still come back as a 200
            errors = result.get("Errors", [])
            if errors:
                raise RuntimeError(f"Could not delete {len(errors)} objects of {slug}")


async def sign_uploads(
    slug: str, files: list[ManifestFile]
) -> tuple[str, list[UploadPolicy]]:
    url = ""
    uploads: list[UploadPolicy] = []
    # Browsers upload to the public endpoint, so policies are signed for it
    async with client(settings.s3_public_endpoint) as s3:
        for file in files:
            fields = {
                "Content-Type": content_type(file.path),
                "x-amz-checksum-algorithm": "SHA256",
                "x-amz-checksum-sha256": file.sha256,
            }
            if file.gzip:
                fields["Content-Encoding"] = "gzip"
            post = await s3.generate_presigned_post(
                Bucket=settings.s3_bucket,
                Key=f"{slug}/{file.path}",
                Fields=fields,
                Conditions=[
                    *({name: value} for name, value in fields.items()),
                    ["content-length-range", file.size, file.size],
                ],
                ExpiresIn=int(settings.upload_window.total_seconds()),
            )
            url = post["url"]
            uploads.append(UploadPolicy(path=file.path, fields=post["fields"]))
    return url, uploads
