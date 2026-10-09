import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx2

from .files import SiteFile


class ApiError(Exception):
    pass


def error_message(response: httpx2.Response) -> str:
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, list):
        return "; ".join(item["msg"] for item in detail)
    if isinstance(detail, str):
        return detail
    return f"Request failed ({response.status_code})."


def is_page(file: SiteFile) -> bool:
    return file.path.lower().endswith((".html", ".htm"))


class Api:
    def __init__(
        self,
        server: str,
        token: str | None = None,
        transport: httpx2.BaseTransport | None = None,
    ) -> None:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.server = server
        self.client = httpx2.Client(
            base_url=server, headers=headers, transport=transport, timeout=30
        )
        # Uploads go straight to S3, which must never see the token
        self.uploads = httpx2.Client(transport=transport, timeout=60)

    def request(self, method: str, path: str, **kwargs: Any) -> httpx2.Response:
        try:
            response = self.client.request(method, path, **kwargs)
        except httpx2.HTTPError as error:
            raise ApiError(f"Couldn't reach {self.server}.") from error
        if response.status_code == 401:
            raise ApiError("You're not signed in. Run redoost login.")
        if response.is_error:
            raise ApiError(error_message(response))
        return response

    def sites_origin(self) -> str | None:
        # The dashboard serves this, so it's absent when only the API is reachable
        try:
            response = self.client.get("/config.json")
            config = response.json()
        except (httpx2.HTTPError, ValueError):
            return None
        return config.get("sitesOrigin")

    def upload(self, url: str, fields: dict[str, str], file: SiteFile) -> None:
        name = file.path.split("/")[-1]
        for attempt in range(3):
            if attempt:
                time.sleep(0.3 * attempt)
            try:
                response = self.uploads.post(
                    url, data=fields, files={"file": (name, file.content)}
                )
            except httpx2.HTTPError as error:
                if attempt == 2:
                    raise ApiError(f"Couldn't upload {file.path}.") from error
                continue
            if response.is_success:
                return
            # S3 rejecting the file won't change on a retry
            retryable = response.status_code >= 500 or response.status_code == 429
            if not retryable or attempt == 2:
                raise ApiError(
                    f"Upload failed ({response.status_code}) for {file.path}."
                )

    def upload_files(self, deployment: dict[str, Any], files: list[SiteFile]) -> None:
        policies = {
            upload["path"]: upload["fields"] for upload in deployment["uploads"]
        }
        pending = [file for file in files if file.path in policies]
        # Pages go last, so a live site never links to assets still uploading
        pages = [file for file in pending if is_page(file)]
        assets = [file for file in pending if not is_page(file)]
        url = deployment["upload_url"]
        with ThreadPoolExecutor(max_workers=16) as pool:
            for batch in (assets, pages):
                uploads = [
                    pool.submit(self.upload, url, policies[file.path], file)
                    for file in batch
                ]
                for upload in uploads:
                    upload.result()
