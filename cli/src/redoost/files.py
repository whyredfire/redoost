import base64
import gzip
import hashlib
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

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
