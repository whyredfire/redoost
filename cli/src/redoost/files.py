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

# The API's defaults, so reading is bounded even when no limits were fetched
default_limits = {
    "max_file_size": 20 * 1024**2,
    "max_deployment_size": 150 * 1024**2,
    "max_deployment_files": 2000,
}


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


def check_uncompressed(sizes: list[tuple[str, int]], limits: dict[str, Any]) -> None:
    """Fail before reading files, so oversized inputs never use the memory."""
    largest = limits["max_file_size"]
    too_big = [(path, size) for path, size in sizes if size > largest]
    if too_big:
        path, size = too_big[0]
        others = f" (and {len(too_big) - 1} more)" if len(too_big) > 1 else ""
        raise SiteError(
            f"{path} is {format_bytes(size)} uncompressed{others}; "
            f"files can be up to {format_bytes(largest)}."
        )
    if len(sizes) > limits["max_deployment_files"]:
        raise SiteError(
            f"The site has {len(sizes)} files; "
            f"sites can have up to {limits['max_deployment_files']}."
        )
    total = sum(size for _, size in sizes)
    if total > limits["max_deployment_size"]:
        raise SiteError(
            f"The site is {format_bytes(total)} uncompressed; "
            f"sites can be up to {format_bytes(limits['max_deployment_size'])}."
        )


def read_zip(path: Path, limits: dict[str, Any] | None = None) -> list[SiteFile]:
    limits = limits or default_limits
    try:
        with zipfile.ZipFile(path) as archive:
            entries = [
                entry
                for entry in archive.infolist()
                if not entry.is_dir() and not entry.filename.startswith("__MACOSX/")
            ]
            entries.sort(key=lambda entry: entry.filename)
            check_uncompressed(
                [(entry.filename, entry.file_size) for entry in entries], limits
            )
            files = [SiteFile(entry.filename, archive.read(entry)) for entry in entries]
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


def read_site(path: Path, limits: dict[str, Any] | None = None) -> list[SiteFile]:
    limits = limits or default_limits
    if path.is_dir():
        selected = [
            (file.relative_to(path).as_posix(), file)
            for file in path.rglob("*")
            if file.is_file()
        ]
        selected.sort(key=lambda item: item[0])
        check_uncompressed(
            [(name, file.stat().st_size) for name, file in selected], limits
        )
        files = [SiteFile(name, file.read_bytes()) for name, file in selected]
    elif path.suffix.lower() == ".zip":
        files = read_zip(path, limits)
    elif path.is_file():
        check_uncompressed([(path.name, path.stat().st_size)], limits)
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
