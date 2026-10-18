import base64
import gzip
import hashlib
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# The same files the dashboard uploads gzipped
compressible = re.compile(
    r"\.(html?|css|[cm]?js|json|map|svg|txt|xml|wasm|webmanifest)$", re.IGNORECASE
)


class SiteError(Exception):
    pass


@dataclass
class SiteFile:
    path: str
    content: bytes
    gzip: bool = False

    def manifest(self) -> dict[str, str | int | bool]:
        digest = hashlib.sha256(self.content).digest()
        return {
            "path": self.path,
            "size": len(self.content),
            "sha256": base64.b64encode(digest).decode(),
            "gzip": self.gzip,
        }


def read_zip(path: Path) -> list[SiteFile]:
    try:
        with zipfile.ZipFile(path) as archive:
            files = [
                SiteFile(name, archive.read(name))
                for name in archive.namelist()
                if not name.endswith("/") and not name.startswith("__MACOSX/")
            ]
    except zipfile.BadZipFile as error:
        raise SiteError("This zip file can't be read.") from error

    # Zips often wrap the site in one folder, like my-site/index.html
    top = files[0].path.split("/")[0] if files else ""
    if files and all(file.path.startswith(f"{top}/") for file in files):
        return [SiteFile(file.path[len(top) + 1 :], file.content) for file in files]
    return files


def to_pages(files: list[SiteFile]) -> list[SiteFile]:
    files = sorted(files, key=lambda file: file.path)
    if not files or any(file.path == "index.html" for file in files):
        return files

    # Without index.html, a lone root HTML file becomes the home page
    pages = [
        file
        for file in files
        if re.fullmatch(r"[^/]+\.html?", file.path, re.IGNORECASE)
    ]
    if len(pages) == 1:
        pages[0].path = "index.html"
        return sorted(files, key=lambda file: file.path)
    if len(files) == 1:
        raise SiteError("Choose an HTML file, a zip, or a folder.")
    return files


def read_site(path: Path) -> list[SiteFile]:
    if path.is_dir():
        files = [
            SiteFile(file.relative_to(path).as_posix(), file.read_bytes())
            for file in path.rglob("*")
            if file.is_file()
        ]
    elif path.suffix.lower() == ".zip":
        files = read_zip(path)
    elif path.is_file():
        files = [SiteFile(path.name, path.read_bytes())]
    else:
        raise SiteError(f"{path} doesn't exist.")
    return to_pages(files)


def compress(file: SiteFile) -> SiteFile:
    if not compressible.search(file.path):
        return file
    # Without a timestamp, the bytes stay the same, so updates skip unchanged files
    packed = gzip.compress(file.content, mtime=0)
    # Tiny files can grow when compressed
    if len(packed) >= len(file.content):
        return file
    return SiteFile(file.path, packed, gzip=True)


def format_bytes(size: int) -> str:
    """Sizes as the dashboard shows them, like 3.4 MiB."""
    if size < 1024:
        return f"{size} B"
    if size < 1024**2:
        return f"{-(-size // 1024)} KiB"
    # :g drops a trailing .0, so 10 MiB isn't shown as 10.0 MiB
    if size < 1024**3:
        return f"{round(size / 1024**2, 1):g} MiB"
    return f"{round(size / 1024**3, 1):g} GiB"


def check_limits(files: list[SiteFile], limits: dict[str, Any]) -> None:
    """Fail before uploading, as the server would, but naming what's too big."""
    largest = limits["max_file_size"]
    too_big = [file for file in files if len(file.content) > largest]
    if too_big:
        file = too_big[0]
        size = format_bytes(len(file.content))
        compressed = " compressed" if file.gzip else ""
        others = f" (and {len(too_big) - 1} more)" if len(too_big) > 1 else ""
        raise SiteError(
            f"{file.path} is {size}{compressed}{others}; "
            f"files can be up to {format_bytes(largest)}."
        )
    if len(files) > limits["max_deployment_files"]:
        raise SiteError(
            f"The site has {len(files)} files; "
            f"sites can have up to {limits['max_deployment_files']}."
        )
    total = sum(len(file.content) for file in files)
    if total > limits["max_deployment_size"]:
        raise SiteError(
            f"The site is {format_bytes(total)} once compressed; "
            f"sites can be up to {format_bytes(limits['max_deployment_size'])}."
        )
