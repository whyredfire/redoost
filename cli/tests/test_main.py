import json
from importlib.metadata import version
from pathlib import Path

import httpx2
import pytest

from redoost import config, main
from redoost.api import Api
from redoost.files import compress, read_site

SERVER = "https://redoost.example.com"
UPLOAD_URL = "https://s3.example.com/sites"
USER = {"id": "u1", "provider": "google", "email": "ada@example.com", "name": "Ada"}


class FakeServer:
    """The redoost API and S3, recording what the CLI sends."""

    def __init__(self) -> None:
        self.requests: list[httpx2.Request] = []
        self.pending_polls = 1
        self.upload_status = 204
        self.stored: list[dict[str, str]] = []

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        route = f"{request.method} {request.url.path}"
        if str(request.url).startswith(UPLOAD_URL):
            return httpx2.Response(self.upload_status)
        if route == "POST /api/auth/cli":
            return httpx2.Response(201, json={"id": "link", "secret": "secret"})
        if route == "POST /api/auth/cli/link/token":
            assert json.loads(request.content) == {"secret": "secret"}
            if self.pending_polls:
                self.pending_polls -= 1
                return httpx2.Response(202)
            return httpx2.Response(200, json={"token": "token", "user": USER})
        if request.headers.get("Authorization") != "Bearer token":
            return httpx2.Response(401, json={"detail": "Invalid token"})
        return self.signed_in(request, route)

    def signed_in(self, request: httpx2.Request, route: str) -> httpx2.Response:
        if route == "GET /api/auth/me":
            return httpx2.Response(200, json=USER)
        if route == "GET /config.json":
            return httpx2.Response(200, json={"sitesOrigin": "https://sites.test"})
        if route in ("POST /api/deployments", "PUT /api/deployments/brave-otter-1a2b"):
            files = json.loads(request.content)["files"]
            uploads = [
                {"path": file["path"], "fields": {"key": file["path"]}}
                for file in files
            ]
            return httpx2.Response(
                200,
                json={
                    "slug": "brave-otter-1a2b",
                    "upload_url": UPLOAD_URL,
                    "uploads": uploads,
                },
            )
        if route == "GET /api/deployments/brave-otter-1a2b/files":
            return httpx2.Response(200, json=self.stored)
        if route == "GET /api/deployments/brave-otter-1a2b":
            return httpx2.Response(
                200, json={"slug": "brave-otter-1a2b", "state": "ready"}
            )
        if route == "GET /api/deployments":
            site = {
                "slug": "brave-otter-1a2b",
                "file_count": 2,
                "created_at": "2026-10-09T10:00:00Z",
            }
            return httpx2.Response(200, json=[site])
        if route.endswith("/complete"):
            return httpx2.Response(
                200, json={"slug": "brave-otter-1a2b", "state": "ready"}
            )
        return httpx2.Response(204)

    def routes(self) -> list[str]:
        return [f"{request.method} {request.url.path}" for request in self.requests]


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> FakeServer:
    fake = FakeServer()
    transport = httpx2.MockTransport(fake.handle)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "config"))
    monkeypatch.setattr(main.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(
        main,
        "Api",
        lambda server, token=None: Api(server, token, transport=transport),
    )
    return fake


def run(capsys: pytest.CaptureFixture[str], *argv: str) -> tuple[str, str]:
    main.main([*argv, "--server", SERVER])
    captured = capsys.readouterr()
    return captured.out, captured.err


def signed_in() -> None:
    config.save_tokens({SERVER: "token"})


def test_login_waits_for_approval(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    out, err = run(capsys, "login")

    assert f"{SERVER}/cli/link" in err
    assert out == "Signed in as ada@example.com\n"
    assert server.routes().count("POST /api/auth/cli/link/token") == 2
    assert config.load_tokens() == {SERVER: "token"}


def test_tokens_belong_to_their_server(server: FakeServer) -> None:
    config.save_tokens({"https://other.example.com": "token"})

    with pytest.raises(SystemExit, match="not signed in"):
        main.main(["whoami", "--server", SERVER])


def test_logout_forgets_the_token(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    signed_in()

    run(capsys, "logout")
    assert config.load_tokens() == {}
    assert (config.config_path().stat().st_mode & 0o777) == 0o600


def test_publish(
    server: FakeServer, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    signed_in()
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<h1>hello</h1>")
    (site / "logo.png").write_bytes(b"png")

    out, _ = run(capsys, "publish", str(site), "--json")

    uploads = [request for request in server.requests if str(request.url) == UPLOAD_URL]
    # The token never goes to S3, and pages go last
    assert all("Authorization" not in request.headers for request in uploads)
    assert [
        b'name="key"\r\n\r\nindex.html' in request.content for request in uploads
    ] == [False, True]
    assert json.loads(out)["url"] == "https://brave-otter-1a2b.sites.test"


def test_failed_updates_free_the_site(server: FakeServer, tmp_path: Path) -> None:
    signed_in()
    server.upload_status = 403
    (tmp_path / "index.html").write_text("<h1>new</h1>")

    with pytest.raises(SystemExit, match="Upload failed \\(403\\)"):
        main.main(
            [
                "publish",
                str(tmp_path / "index.html"),
                "--update",
                "brave-otter-1a2b",
                "--server",
                SERVER,
            ]
        )
    assert "POST /api/deployments/brave-otter-1a2b/cancel" in server.routes()


def stored_site(site: Path) -> list[dict[str, str]]:
    files = [compress(file).manifest() for file in read_site(site)]
    return [
        {"path": str(file["path"]), "sha256": str(file["sha256"])} for file in files
    ]


def test_unchanged_updates_publish_nothing(
    server: FakeServer, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    signed_in()
    (tmp_path / "index.html").write_text("<h1>same</h1>")
    server.stored = stored_site(tmp_path)

    out, _ = run(capsys, "publish", str(tmp_path), "--update", "brave-otter-1a2b")

    assert out == "No changes to publish\n"
    assert "PUT /api/deployments/brave-otter-1a2b" not in server.routes()


def test_removed_files_are_a_change(
    server: FakeServer, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    signed_in()
    (tmp_path / "index.html").write_text("<h1>same</h1>")
    server.stored = [*stored_site(tmp_path), {"path": "old.html", "sha256": "x"}]

    out, _ = run(capsys, "publish", str(tmp_path), "--update", "brave-otter-1a2b")

    assert out == "Published https://brave-otter-1a2b.sites.test\n"
    assert "PUT /api/deployments/brave-otter-1a2b" in server.routes()


def test_list_and_delete(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    signed_in()

    out, _ = run(capsys, "list")
    assert out == "https://brave-otter-1a2b.sites.test  2 files  2026-10-09\n"
    out, _ = run(capsys, "delete", "brave-otter-1a2b")
    assert out == "Deleted brave-otter-1a2b\n"
    assert "DELETE /api/deployments/brave-otter-1a2b" in server.routes()


def test_version(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        main.main(["--version"])

    assert capsys.readouterr().out == f"redoost {version('redoost')}\n"


def test_expired_sign_ins_need_a_new_login(server: FakeServer) -> None:
    config.save_tokens({SERVER: "expired"})

    with pytest.raises(SystemExit, match="Run redoost login"):
        main.main(["whoami", "--server", SERVER])
