import base64
import gzip
import hashlib
import zipfile
from pathlib import Path

import pytest

from redoost.files import (
    SiteError,
    SiteFile,
    compress,
    default_limits,
    format_bytes,
    read_site,
)


def write(root: Path, files: dict[str, bytes]) -> None:
    for path, content in files.items():
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_bytes(content)


def test_reads_folders(tmp_path: Path) -> None:
    write(
        tmp_path, {"index.html": b"<h1>", "assets/app.js": b"x", ".well-known/a": b""}
    )

    assert [file.path for file in read_site(tmp_path)] == [
        ".well-known/a",
        "assets/app.js",
        "index.html",
    ]


def test_leaves_out_dotfiles(tmp_path: Path) -> None:
    write(
        tmp_path,
        {"index.html": b"<h1>", ".env": b"SECRET=1", ".git/config": b"[core]"},
    )

    assert [file.path for file in read_site(tmp_path)] == ["index.html"]


def test_leaves_out_links_to_files_outside_the_folder(tmp_path: Path) -> None:
    site = tmp_path / "site"
    write(site, {"index.html": b"<h1>", "app.js": b"x"})
    write(tmp_path, {"credentials": b"secret"})
    (site / "credentials").symlink_to(tmp_path / "credentials")
    (site / "main.js").symlink_to(site / "app.js")

    assert [file.path for file in read_site(site)] == [
        "app.js",
        "index.html",
        "main.js",
    ]


def test_reads_zips_without_their_wrapping_folder(tmp_path: Path) -> None:
    archive = tmp_path / "site.zip"
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("my-site/index.html", "<h1>")
        zip_file.writestr("my-site/app.js", "x")
        zip_file.writestr("__MACOSX/my-site/._index.html", "junk")
        zip_file.writestr("my-site/.DS_Store", "junk")

    assert [file.path for file in read_site(archive)] == ["app.js", "index.html"]


def test_rejects_unreadable_zips(tmp_path: Path) -> None:
    archive = tmp_path / "site.zip"
    archive.write_bytes(b"not a zip")

    with pytest.raises(SiteError, match="can't be read"):
        read_site(archive)


def test_rejects_oversized_zip_entries_before_reading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    archive = tmp_path / "site.zip"
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("photo.png", b"x" * 2048)

    def unexpected_read(*args: object, **kwargs: object) -> bytes:
        raise AssertionError("read an oversized zip entry")

    monkeypatch.setattr(zipfile.ZipFile, "read", unexpected_read)
    limits = {**default_limits, "max_file_size": 1024}

    with pytest.raises(SiteError, match="photo.png is 2 KiB uncompressed"):
        read_site(archive, limits)


def test_rejects_oversized_files_before_reading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    site = tmp_path / "site"
    site.mkdir()
    (site / "photo.png").write_bytes(b"x" * 2048)

    def unexpected_read(self: Path) -> bytes:
        raise AssertionError("read an oversized file")

    monkeypatch.setattr(Path, "read_bytes", unexpected_read)
    limits = {**default_limits, "max_file_size": 1024}

    with pytest.raises(SiteError, match="photo.png is 2 KiB uncompressed"):
        read_site(site, limits)


def test_rejects_zips_that_expand_past_the_deployment_limit(tmp_path: Path) -> None:
    archive = tmp_path / "site.zip"
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("index.html", "x" * 1000)
        zip_file.writestr("app.js", "x" * 1000)
    limits = {**default_limits, "max_deployment_size": 1024}

    with pytest.raises(SiteError, match="The site is 2 KiB uncompressed"):
        read_site(archive, limits)


def test_a_lone_html_file_becomes_the_home_page(tmp_path: Path) -> None:
    page = tmp_path / "about.html"
    page.write_bytes(b"<h1>")
    write(tmp_path / "folder", {"page.html": b"<h1>", "style.css": b"x"})

    assert [file.path for file in read_site(page)] == ["index.html"]
    assert [file.path for file in read_site(tmp_path / "folder")] == [
        "index.html",
        "style.css",
    ]


@pytest.mark.parametrize("name", ["logo.png", "missing.html"])
def test_rejects_other_single_files(tmp_path: Path, name: str) -> None:
    if name == "logo.png":
        (tmp_path / name).write_bytes(b"png")

    with pytest.raises(SiteError):
        read_site(tmp_path / name)


def test_compresses_text_files_when_smaller() -> None:
    page = SiteFile("index.html", b"<p>hello</p>" * 100)
    packed = compress(page)

    assert packed.gzip and gzip.decompress(packed.content) == page.content
    # The same bytes every time, so updates can skip unchanged files
    assert compress(page).content == packed.content
    assert compress(SiteFile("tiny.html", b"<p>")).gzip is False
    assert compress(SiteFile("logo.png", b"x" * 1000)).gzip is False


def test_manifest_describes_the_uploaded_bytes() -> None:
    file = compress(SiteFile("app.js", b"console.log(1);" * 50))
    digest = base64.b64encode(hashlib.sha256(file.content).digest()).decode()

    assert file.manifest() == {
        "path": "app.js",
        "size": len(file.content),
        "sha256": digest,
        "gzip": True,
    }


@pytest.mark.parametrize(
    ("size", "shown"),
    [
        (900, "900 B"),
        (1025, "2 KiB"),
        (3565158, "3.4 MiB"),
        (10 * 1024**2, "10 MiB"),
        (1024**3, "1 GiB"),
    ],
)
def test_format_bytes(size: int, shown: str) -> None:
    assert format_bytes(size) == shown
