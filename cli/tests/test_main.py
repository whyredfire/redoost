import json
from importlib.metadata import version
from pathlib import Path
from typing import Any

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
        self.limits = {
            "max_file_size": 20 * 1024**2,
            "max_deployment_size": 150 * 1024**2,
            "max_deployment_files": 2000,
        }
        # None for servers from before usage was reported
        self.usage: dict[str, int] | None = {"used": 3565158, "limit": 1024**3}

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
        if route == "GET /api/deployments/usage":
            if self.usage is None:
                return httpx2.Response(404, json={"detail": "Not Found"})
            return httpx2.Response(200, json=self.usage)
        if route == "GET /api/deployments/limits":
            return httpx2.Response(200, json=self.limits)
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
                "total_size": 3565158,
                "description": "Portfolio draft",
                "created_at": "2026-10-09T10:00:00Z",
            }
            offline = {
                **site,
                "slug": "quiet-heron-7f3c",
                "file_count": 1,
                "total_size": 900,
                "description": "",
                "enabled": False,
            }
            return httpx2.Response(200, json=[site, offline])
        if route == "PATCH /api/deployments/brave-otter-1a2b":
            change = json.loads(request.content)
            return httpx2.Response(200, json={"slug": "brave-otter-1a2b", **change})
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


def test_whoami_shows_storage_use(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    signed_in()

    out, _ = run(capsys, "whoami")
    assert out == "ada@example.com\n3.4 MiB of 1 GiB used\n"
    out, _ = run(capsys, "whoami", "--json")
    assert json.loads(out) == {**USER, "usage": server.usage}


def test_whoami_on_servers_without_usage(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    signed_in()
    server.usage = None

    out, _ = run(capsys, "whoami")
    assert out == "ada@example.com\n"


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


def sent(server: FakeServer, route: str) -> list[Any]:
    return [
        json.loads(request.content)
        for request in server.requests
        if f"{request.method} {request.url.path}" == route
    ]


def test_publish_with_a_description(
    server: FakeServer, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    signed_in()
    (tmp_path / "index.html").write_text("<h1>hello</h1>")

    run(capsys, "publish", str(tmp_path / "index.html"), "-d", "Portfolio draft")

    for route in (
        "POST /api/deployments",
        "POST /api/deployments/brave-otter-1a2b/complete",
    ):
        assert sent(server, route)[0]["description"] == "Portfolio draft"


def test_updates_keep_the_description_without_one(
    server: FakeServer, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    signed_in()
    (tmp_path / "index.html").write_text("<h1>new</h1>")

    run(capsys, "publish", str(tmp_path / "index.html"), "-u", "brave-otter-1a2b")

    completed = sent(server, "POST /api/deployments/brave-otter-1a2b/complete")
    assert "description" not in completed[0]


def test_unchanged_updates_still_change_the_description(
    server: FakeServer, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    signed_in()
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<h1>same</h1>")
    server.stored = stored_site(site)

    out, _ = run(capsys, "publish", str(site), "-u", "brave-otter-1a2b", "-d", "Final")

    assert out == "No changes to publish, but updated the description\n"
    assert sent(server, "PATCH /api/deployments/brave-otter-1a2b") == [
        {"description": "Final"}
    ]
    assert "PUT /api/deployments/brave-otter-1a2b" not in server.routes()


def test_describe(server: FakeServer, capsys: pytest.CaptureFixture[str]) -> None:
    signed_in()

    out, _ = run(capsys, "describe", "brave-otter-1a2b", "Portfolio, final")
    assert out == "Described brave-otter-1a2b\n"
    out, _ = run(capsys, "describe", "brave-otter-1a2b", "")
    assert out == "Cleared brave-otter-1a2b's description\n"
    assert sent(server, "PATCH /api/deployments/brave-otter-1a2b") == [
        {"description": "Portfolio, final"},
        {"description": ""},
    ]


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


@pytest.mark.parametrize(
    ("limit", "value", "error"),
    [
        (
            "max_file_size",
            2048,
            "photo.png is 3 KiB \\(and 1 more\\); files can be up to 2 KiB",
        ),
        ("max_deployment_files", 2, "The site has 3 files; sites can have up to 2"),
        (
            "max_deployment_size",
            4096,
            "The site is 6 KiB once compressed; sites can be up to 4 KiB",
        ),
    ],
)
def test_publish_checks_limits_before_uploading(
    server: FakeServer, tmp_path: Path, limit: str, value: int, error: str
) -> None:
    signed_in()
    server.limits[limit] = value
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<h1>hello</h1>")
    (site / "photo.png").write_bytes(b"p" * 3000)
    (site / "video.webm").write_bytes(b"v" * 2500)

    with pytest.raises(SystemExit, match=error):
        main.main(["publish", str(site), "--server", SERVER])
    assert "POST /api/deployments" not in server.routes()


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

    out, _ = run(capsys, "publish", str(tmp_path), "-u", "brave-otter-1a2b")

    assert out == "Published https://brave-otter-1a2b.sites.test\n"
    assert "PUT /api/deployments/brave-otter-1a2b" in server.routes()


def test_list_and_delete(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    signed_in()

    out, _ = run(capsys, "list")
    assert out == (
        "https://brave-otter-1a2b.sites.test  2 files  3.4 MiB  2026-10-09"
        "  Portfolio draft\n"
        "https://quiet-heron-7f3c.sites.test  1 file  900 B  2026-10-09  offline\n"
    )
    out, _ = run(capsys, "delete", "brave-otter-1a2b")
    assert out == "Deleted brave-otter-1a2b\n"
    assert "DELETE /api/deployments/brave-otter-1a2b" in server.routes()


def test_disable_and_enable(
    server: FakeServer, capsys: pytest.CaptureFixture[str]
) -> None:
    signed_in()

    out, _ = run(capsys, "disable", "brave-otter-1a2b")
    assert out.startswith("brave-otter-1a2b is offline")
    out, _ = run(capsys, "enable", "brave-otter-1a2b", "--json")
    assert json.loads(out) == {"slug": "brave-otter-1a2b", "enabled": True}
    patches = [r for r in server.requests if r.method == "PATCH"]
    assert [json.loads(r.content) for r in patches] == [
        {"enabled": False},
        {"enabled": True},
    ]


@pytest.mark.parametrize("flag", ["--version", "-v"])
def test_version(capsys: pytest.CaptureFixture[str], flag: str) -> None:
    with pytest.raises(SystemExit):
        main.main([flag])

    assert capsys.readouterr().out == f"redoost {version('redoost')}\n"


def test_expired_sign_ins_need_a_new_login(server: FakeServer) -> None:
    config.save_tokens({SERVER: "expired"})

    with pytest.raises(SystemExit, match="Run redoost login"):
        main.main(["whoami", "--server", SERVER])
