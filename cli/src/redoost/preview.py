import mimetypes
import socket
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from .files import SiteFile

# The API's default types, so files get the type they're published with
mime_types = mimetypes.MimeTypes()

not_found_page = b"""<!doctype html>
<meta charset="utf-8">
<title>Not found</title>
<h1>Not found</h1>
<p>This site has no page at this address.</p>
"""


@dataclass
class Answer:
    status: int
    file: SiteFile | None = None
    location: str | None = None


def content_type(path: str) -> str:
    mime_type, encoding = mime_types.guess_type(path)
    # Compressed files would otherwise get the MIME type of their contents
    return mime_type if mime_type and not encoding else "application/octet-stream"


def resolve(files: dict[str, SiteFile], target: str) -> Answer:
    """Answers a request the way published sites are served."""
    url = urlsplit(target)
    path = unquote(url.path)
    key = path.lstrip("/")
    if key == "" or key.endswith("/"):
        key += "index.html"
    if key in files:
        return Answer(200, files[key])
    if f"{key}/index.html" in files:
        query = f"?{url.query}" if url.query else ""
        return Answer(302, location=f"{url.path}/{query}")
    # Sites without a 404.html are single-page apps, so routes get index.html
    if "404.html" in files:
        return Answer(404, files["404.html"])
    name = path.rsplit("/", 1)[-1]
    if "." not in name and "index.html" in files:
        return Answer(200, files["index.html"])
    return Answer(404)


def create_server(files: list[SiteFile], host: str, port: int) -> ThreadingHTTPServer:
    by_path = {file.path: file for file in files}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            answer = resolve(by_path, self.path)
            if answer.file:
                body = answer.file.content
                kind = content_type(answer.file.path)
            else:
                body = b"" if answer.location else not_found_page
                kind = "text/html; charset=utf-8"
            self.send_response(answer.status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-cache")
            if answer.location:
                self.send_header("Location", answer.location)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        do_HEAD = do_GET

        def log_message(self, format: str, *args: object) -> None:
            pass

    return ThreadingHTTPServer((host, port), Handler)


def network_address() -> str | None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            # Connecting UDP sends nothing; it only picks the outgoing interface
            probe.connect(("10.255.255.255", 1))
        except OSError:
            return None
        return probe.getsockname()[0]
