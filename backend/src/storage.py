import asyncio
import mimetypes
import re
import secrets
from collections.abc import AsyncIterator, Awaitable, Iterable
from dataclasses import dataclass
from typing import Any

import aioboto3
from aiobotocore.config import AioConfig
from botocore.exceptions import ClientError
from pydantic import AnyHttpUrl

from .config import settings
from .models import ManifestFile, UploadPolicy

session = aioboto3.Session()
mime_types = mimetypes.MimeTypes()

# Requests a client sends at once; the rest wait their turn rather than for a
# connection, which would count against the timeouts
concurrency = 32


def client(endpoint: AnyHttpUrl) -> Any:
    return session.client(
        "s3",
        endpoint_url=str(endpoint),
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        config=AioConfig(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            max_pool_connections=concurrency,
            # Fails within the gateway's 60 seconds rather than hanging on S3
            connect_timeout=5,
            read_timeout=15,
            retries={"mode": "standard", "total_max_attempts": 3},
        ),
    )


async def limited[T](
    calls: Iterable[Awaitable[T]], limit: int = concurrency
) -> list[T]:
    """Like asyncio.gather, with at most `limit` running at once."""
    semaphore = asyncio.Semaphore(limit)

    async def run(call: Awaitable[T]) -> T:
        async with semaphore:
            return await call

    return await asyncio.gather(*(run(call) for call in calls))


def content_type(path: str) -> str:
    mime_type, encoding = mime_types.guess_file_type(path)
    # Compressed files would otherwise get the MIME type of their contents
    return mime_type if mime_type and not encoding else "application/octet-stream"


async def check_storage() -> None:
    async with client(settings.s3_endpoint) as s3:
        await s3.head_bucket(Bucket=settings.s3_bucket)


# Each publish or update uploads into its own folder, like brave-otter-1a2b/v-0123456789ab/,
# so a site switches to it in one step. Sites from before versions keep their files at
# the slug's root, next to their newer versions' folders.
version_folder = re.compile(r"v-[0-9a-f]{12}/")


def new_folder(slug: str) -> str:
    return f"{slug}/v-{secrets.token_hex(6)}/"


async def list_keys(s3: Any, prefix: str) -> list[str]:
    keys: list[str] = []
    pages = s3.get_paginator("list_objects_v2").paginate(
        Bucket=settings.s3_bucket, Prefix=prefix
    )
    async for page in pages:
        keys.extend(item["Key"] for item in page.get("Contents", []))
    return keys


async def list_files(s3: Any, folder: str) -> list[str]:
    keys = await list_keys(s3, folder)
    return [key for key in keys if not version_folder.match(key.removeprefix(folder))]


async def delete_keys(s3: Any, keys: list[str]) -> None:
    # DeleteObjects takes up to 1000 keys at a time
    for start in range(0, len(keys), 1000):
        batch = [{"Key": key} for key in keys[start : start + 1000]]
        result = await s3.delete_objects(
            Bucket=settings.s3_bucket, Delete={"Objects": batch, "Quiet": True}
        )
        # Failures for individual keys still come back as a 200
        errors = result.get("Errors", [])
        if errors:
            raise RuntimeError(f"Could not delete {len(errors)} objects")


@dataclass
class StoredObject:
    sha256: str | None
    # The bytes actually stored, which a manifest can't vouch for
    size: int


async def read_head(s3: Any, key: str) -> dict[str, Any] | None:
    try:
        return await s3.head_object(
            Bucket=settings.s3_bucket, Key=key, ChecksumMode="ENABLED"
        )
    except ClientError as error:
        # Deleted since it was listed, like by a cancelled upload
        if error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
            return None
        raise


# Listings leave out checksums, so every object is read on its own
async def read_objects(folder: str) -> dict[str, StoredObject]:
    async with client(settings.s3_endpoint) as s3:
        keys = await list_files(s3, folder)
        heads = await limited(read_head(s3, key) for key in keys)
    return {
        key.removeprefix(folder): StoredObject(
            sha256=head.get("ChecksumSHA256"), size=head["ContentLength"]
        )
        for key, head in zip(keys, heads, strict=True)
        if head is not None
    }


async def slug_pages() -> AsyncIterator[list[str]]:
    """The bucket's site folders, a listing page (up to 1000) at a time."""
    async with client(settings.s3_endpoint) as s3:
        pages = s3.get_paginator("list_objects_v2").paginate(
            Bucket=settings.s3_bucket, Delimiter="/"
        )
        async for page in pages:
            prefixes = page.get("CommonPrefixes", [])
            yield [prefix["Prefix"].removesuffix("/") for prefix in prefixes]


async def delete_folder(folder: str) -> None:
    async with client(settings.s3_endpoint) as s3:
        await delete_keys(s3, await list_files(s3, folder))


async def delete_paths(folder: str, paths: list[str]) -> None:
    if paths:
        async with client(settings.s3_endpoint) as s3:
            await delete_keys(s3, [f"{folder}{path}" for path in paths])


async def delete_site(slug: str) -> None:
    async with client(settings.s3_endpoint) as s3:
        await delete_keys(s3, await list_keys(s3, f"{slug}/"))


async def delete_sites(slugs: Iterable[str]) -> None:
    # Each has a client of its own, so only a few go at once
    await limited((delete_site(slug) for slug in slugs), limit=4)


# Copies keep their checksum, type, and encoding, so they check out like uploads
async def copy_files(source: str, target: str, paths: list[str]) -> None:
    async with client(settings.s3_endpoint) as s3:
        await limited(
            s3.copy_object(
                Bucket=settings.s3_bucket,
                Key=f"{target}{path}",
                CopySource={"Bucket": settings.s3_bucket, "Key": f"{source}{path}"},
            )
            for path in paths
        )


async def sign_uploads(
    folder: str, files: list[ManifestFile]
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
                Key=f"{folder}{file.path}",
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
