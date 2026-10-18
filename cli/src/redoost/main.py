import argparse
import json
import os
import subprocess
import sys
import time
from collections.abc import Callable
from importlib.metadata import version
from pathlib import Path
from typing import Any

from . import config, preview, updates
from .api import Api, ApiError
from .files import SiteError, check_limits, compress, format_bytes, read_site
from .spinner import Spinner

Command = Callable[[argparse.Namespace], None]


def output(args: argparse.Namespace, data: Any, text: str) -> None:
    # Flushed, since preview keeps running after it prints
    print(json.dumps(data) if args.json else text, flush=True)


def signed_in(args: argparse.Namespace) -> Api:
    tokens = config.load_tokens()
    token = tokens.get(args.server)
    if token is None:
        raise ApiError("You're not signed in. Run redoost login.")
    return Api(args.server, token)


def site_url(api: Api, slug: str) -> str | None:
    origin = api.sites_origin()
    if origin is None:
        return None
    scheme, host = origin.split("://", 1)
    return f"{scheme}://{slug}.{host}"


def login(args: argparse.Namespace) -> None:
    api = Api(args.server)
    response = api.request("POST", "/api/auth/cli")
    started = response.json()
    # Printed even with --json, since someone has to open it
    print(
        f"Open this link on any device to sign in:\n{args.server}/cli/{started['id']}",
        file=sys.stderr,
    )
    claim = {"secret": started["secret"]}
    with Spinner("Waiting for you to continue in the browser", args.json):
        # 202 until the link is approved; it expires with a 404
        while response.status_code != 200:
            time.sleep(2)
            response = api.request(
                "POST", f"/api/auth/cli/{started['id']}/token", json=claim
            )

    signed = response.json()
    tokens = config.load_tokens()
    tokens[args.server] = signed["token"]
    config.save_tokens(tokens)
    output(args, signed["user"], f"Signed in as {signed['user']['email']}")


def logout(args: argparse.Namespace) -> None:
    tokens = config.load_tokens()
    tokens.pop(args.server, None)
    config.save_tokens(tokens)
    output(args, {}, "Signed out")


def whoami(args: argparse.Namespace) -> None:
    api = signed_in(args)
    user = api.request("GET", "/api/auth/me").json()
    lines = [user["email"]]
    # Servers before 0.3.1 don't report it
    try:
        usage = api.request("GET", "/api/deployments/usage").json()
    except ApiError:
        usage = None
    if usage:
        user["usage"] = usage
        lines.append(
            f"{format_bytes(usage['used'])} of {format_bytes(usage['limit'])} used"
        )
    output(args, user, "\n".join(lines))


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def unchanged(api: Api, slug: str, manifest: dict[str, Any]) -> bool:
    response = api.request("GET", f"/api/deployments/{slug}/files")
    stored = {file["path"]: file["sha256"] for file in response.json()}
    wanted = {file["path"]: file["sha256"] for file in manifest["files"]}
    return stored == wanted


def publish(args: argparse.Namespace) -> None:
    api = signed_in(args)
    with Spinner("Preparing files", args.json):
        files = [compress(file) for file in read_site(args.path)]
    check_limits(files, api.request("GET", "/api/deployments/limits").json())
    manifest = {"files": [file.manifest() for file in files]}
    if args.update and unchanged(api, args.update, manifest):
        response = api.request("GET", f"/api/deployments/{args.update}")
        url = site_url(api, args.update)
        output(args, {**response.json(), "url": url}, "No changes to publish")
        return

    if args.update:
        response = api.request("PUT", f"/api/deployments/{args.update}", json=manifest)
    else:
        response = api.request("POST", "/api/deployments", json=manifest)
    deployment = response.json()
    slug = deployment["slug"]
    count = len(deployment["uploads"])

    # Updates that only remove files have nothing to upload
    text = f"Uploading {plural(count, 'file')}" if count else "Publishing"
    status = Spinner(text, args.json)
    with status:
        try:
            api.upload_files(
                deployment,
                files,
                lambda done: status.update(
                    f"Uploading {done} of {plural(count, 'file')}"
                ),
            )
            status.update("Publishing")
            response = api.request(
                "POST", f"/api/deployments/{slug}/complete", json=manifest
            )
        except BaseException:
            # An unfinished update keeps the site locked until it's cancelled
            if args.update:
                api.request("POST", f"/api/deployments/{slug}/cancel")
            raise
    published = response.json()
    url = site_url(api, slug)
    output(args, {**published, "url": url}, f"Published {url or slug}")


def preview_site(args: argparse.Namespace) -> None:
    files = read_site(args.path)
    try:
        server = preview.create_server(files, args.host, args.port)
    except OSError as error:
        sys.exit(f"error: Couldn't listen on {args.host}:{args.port}: {error.strerror}")
    port = server.server_address[1]

    everywhere = args.host == "0.0.0.0"
    url = f"http://{'127.0.0.1' if everywhere else args.host}:{port}"
    address = preview.network_address() if everywhere else None
    network_url = f"http://{address}:{port}" if address else None
    text = f"Previewing at {url}"
    if network_url:
        text += f", and on your network at {network_url}"
    output(args, {"url": url, "network_url": network_url}, f"{text} (Ctrl+C to stop)")
    with server:
        server.serve_forever()


def list_sites(args: argparse.Namespace) -> None:
    api = signed_in(args)
    response = api.request("GET", "/api/deployments")
    sites = response.json()
    for site in sites:
        site["url"] = site_url(api, site["slug"])
    lines = [
        f"{site['url'] or site['slug']}  {plural(site['file_count'], 'file')}  "
        f"{format_bytes(site['total_size'])}  {site['created_at'][:10]}"
        # Servers before this setting existed don't report it
        f"{'' if site.get('enabled', True) else '  offline'}"
        for site in sites
    ]
    output(args, sites, "\n".join(lines) or "No sites yet")


def switch(args: argparse.Namespace, enabled: bool) -> None:
    response = signed_in(args).request(
        "PATCH", f"/api/deployments/{args.slug}", json={"enabled": enabled}
    )
    text = (
        f"{args.slug} is online"
        if enabled
        else f"{args.slug} is offline; visitors may still see it for a minute"
    )
    output(args, response.json(), text)


def enable(args: argparse.Namespace) -> None:
    switch(args, True)


def disable(args: argparse.Namespace) -> None:
    switch(args, False)


def update(args: argparse.Namespace) -> None:
    available = updates.server_version(args.server)
    if updates.release(available) is None:
        raise ApiError(f"Couldn't tell which version {args.server} runs.")
    newer = updates.newer_release(available)
    current = version("redoost")
    if newer is None:
        output(
            args,
            {"version": current, "updated": False},
            f"redoost {current} is up to date",
        )
        return

    spec = updates.wheel_url(newer)
    command = updates.install_command(spec)
    if command is None:
        choices = [f"uv tool install --force {spec}", f"pipx install --force {spec}"]
        text = f"redoost {newer} is available. Install it with one of:"
        output(
            args,
            {"version": newer, "updated": False, "install": choices},
            "\n  ".join([text, *choices]),
        )
        return
    if subprocess.run(command, check=False).returncode != 0:
        raise ApiError(f"Couldn't install redoost {newer}.")
    output(args, {"version": newer, "updated": True}, f"Updated to redoost {newer}")


def delete(args: argparse.Namespace) -> None:
    signed_in(args).request("DELETE", f"/api/deployments/{args.slug}")
    output(args, {"slug": args.slug}, f"Deleted {args.slug}")


def parse(argv: list[str] | None) -> argparse.Namespace:
    # Accepted after the command too, as in redoost list --json
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--server",
        default=os.environ.get("REDOOST_SERVER", config.default_server),
        help="redoost dashboard URL (default: %(default)s, or REDOOST_SERVER)",
    )
    common.add_argument("--json", action="store_true", help="print results as JSON")

    parser = argparse.ArgumentParser(
        prog="redoost", description="Publish static sites to redoost."
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {version('redoost')}"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("login", parents=[common], help="sign in through a link")
    commands.add_parser("logout", parents=[common], help="forget this sign-in")
    commands.add_parser("whoami", parents=[common], help="show who's signed in")
    publish_parser = commands.add_parser(
        "publish", parents=[common], help="publish a folder, zip, or HTML file"
    )
    publish_parser.add_argument("path", type=Path)
    publish_parser.add_argument(
        "--update", metavar="SLUG", help="replace an existing site's files"
    )
    preview_parser = commands.add_parser(
        "preview",
        parents=[common],
        help="serve a folder, zip, or HTML file locally, as it would be published",
    )
    preview_parser.add_argument("path", type=Path)
    preview_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="address to listen on; 0.0.0.0 for every network (default: %(default)s)",
    )
    preview_parser.add_argument(
        "--port", type=int, default=0, help="port to listen on (default: a free one)"
    )
    commands.add_parser("list", parents=[common], help="list your sites")
    for name, help_text in [
        ("enable", "put a site back online"),
        ("disable", "take a site offline, keeping its files"),
    ]:
        commands.add_parser(name, parents=[common], help=help_text).add_argument("slug")
    delete_parser = commands.add_parser(
        "delete", parents=[common], help="delete a site"
    )
    delete_parser.add_argument("slug")
    commands.add_parser(
        "update", parents=[common], help="update the CLI to the server's version"
    )

    args = parser.parse_args(argv)
    args.server = args.server.rstrip("/")
    return args


commands: dict[str, Command] = {
    "login": login,
    "logout": logout,
    "whoami": whoami,
    "publish": publish,
    "preview": preview_site,
    "list": list_sites,
    "enable": enable,
    "disable": disable,
    "delete": delete,
    "update": update,
}


def main(argv: list[str] | None = None) -> None:
    args = parse(argv)
    try:
        commands[args.command](args)
    except (ApiError, SiteError) as error:
        sys.exit(f"error: {error}")
    except KeyboardInterrupt:
        sys.exit(130)
    # After the output, and only for people, since scripts can't act on it
    if args.command != "update" and not args.json and sys.stderr.isatty():
        updates.notify(args.server)
