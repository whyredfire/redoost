import json
import threading
from pathlib import Path

import httpx2
import pytest

from redoost import main, preview
from redoost.files import SiteFile, read_site

PAGES = {
    path: SiteFile(path, path.encode())
    for path in ["index.html", "app.js", "docs/index.html"]
}


@pytest.mark.parametrize(
    ("target", "status", "served"),
    [
        ("/", 200, "index.html"),
        ("/app.js?v=1", 200, "app.js"),
        ("/docs/", 200, "docs/index.html"),
        # Missing routes without an extension are single-page app routes
        ("/dashboard/settings", 200, "index.html"),
        ("/missing.png", 404, None),
    ],
)
def test_single_page_apps(target: str, status: int, served: str | None) -> None:
    answer = preview.resolve(PAGES, target)

    assert answer.status == status
    assert (answer.file.path if answer.file else None) == served


def test_folders_redirect_to_their_index() -> None:
    answer = preview.resolve(PAGES, "/docs?page=2")

    assert (answer.status, answer.location) == (302, "/docs/?page=2")


def test_sites_with_a_404_page_show_it() -> None:
    files = {**PAGES, "404.html": SiteFile("404.html", b"gone")}

    for target in ["/dashboard", "/missing.png"]:
        answer = preview.resolve(files, target)
        assert answer.status == 404
        assert answer.file == files["404.html"]


def test_paths_are_decoded() -> None:
    files = {"my page.html": SiteFile("my page.html", b"hi")}

    assert preview.resolve(files, "/my%20page.html").status == 200


def test_server(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<h1>Home</h1>")
    (tmp_path / "style.css").write_text("h1 {}")
    files = read_site(tmp_path)
    server = preview.create_server(files, "127.0.0.1", 0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}"

    with server:
        page = httpx2.get(f"{url}/about")
        style = httpx2.get(f"{url}/style.css")
        missing = httpx2.get(f"{url}/missing.png")
        server.shutdown()

    assert page.text == "<h1>Home</h1>"
    assert page.headers["Cache-Control"] == "no-cache"
    assert style.headers["Content-Type"] == "text/css"
    assert missing.status_code == 404
    assert "Not found" in missing.text


def test_preview_command(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    (tmp_path / "index.html").write_text("<h1>Home</h1>")
    monkeypatch.setattr(preview, "network_address", lambda: "192.168.1.5")
    monkeypatch.setattr(preview.ThreadingHTTPServer, "serve_forever", lambda self: None)

    main.main(["preview", str(tmp_path), "--host", "0.0.0.0", "--json"])

    printed = json.loads(capsys.readouterr().out)
    port = printed["url"].rsplit(":", 1)[1]
    assert printed == {
        "url": f"http://127.0.0.1:{port}",
        "network_url": f"http://192.168.1.5:{port}",
    }


def test_ports_in_use(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<h1>Home</h1>")
    taken = preview.create_server([], "127.0.0.1", 0)
    port = str(taken.server_address[1])

    with taken, pytest.raises(SystemExit) as exit:
        main.main(["preview", str(tmp_path), "--port", port])

    assert str(exit.value).startswith(f"error: Couldn't listen on 127.0.0.1:{port}")
