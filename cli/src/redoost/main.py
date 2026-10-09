import argparse
import json
import os
import sys
import time
from collections.abc import Callable
from importlib.metadata import version
from pathlib import Path
from typing import Any

from . import config
from .api import Api, ApiError
from .files import SiteError, compress, read_site

Command = Callable[[argparse.Namespace], None]


def output(args: argparse.Namespace, data: Any, text: str) -> None:
    print(json.dumps(data) if args.json else text)


def note(args: argparse.Namespace, text: str) -> None:
    # Progress goes to stderr, so --json output stays parseable
    if not args.json:
        print(text, file=sys.stderr)


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
    response = signed_in(args).request("GET", "/api/auth/me")
    user = response.json()
    output(args, user, user["email"])


def publish(args: argparse.Namespace) -> None:
    api = signed_in(args)
    files = [compress(file) for file in read_site(args.path)]
    manifest = {"files": [file.manifest() for file in files]}
    if args.update:
        response = api.request("PUT", f"/api/deployments/{args.update}", json=manifest)
    else:
        response = api.request("POST", "/api/deployments", json=manifest)
    deployment = response.json()
    slug = deployment["slug"]

    note(args, f"Uploading {len(deployment['uploads'])} of {len(files)} files…")
    try:
        api.upload_files(deployment, files)
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


def list_sites(args: argparse.Namespace) -> None:
    api = signed_in(args)
    response = api.request("GET", "/api/deployments")
    sites = response.json()
    for site in sites:
        site["url"] = site_url(api, site["slug"])
    lines = [
        f"{site['url'] or site['slug']}  {site['file_count']} files  "
        f"{site['created_at'][:10]}"
        for site in sites
    ]
    output(args, sites, "\n".join(lines) or "No sites yet")


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
    commands.add_parser("list", parents=[common], help="list your sites")
    delete_parser = commands.add_parser(
        "delete", parents=[common], help="delete a site"
    )
    delete_parser.add_argument("slug")

    args = parser.parse_args(argv)
    args.server = args.server.rstrip("/")
    return args


commands: dict[str, Command] = {
    "login": login,
    "logout": logout,
    "whoami": whoami,
    "publish": publish,
    "list": list_sites,
    "delete": delete,
}


def main(argv: list[str] | None = None) -> None:
    args = parse(argv)
    try:
        commands[args.command](args)
    except (ApiError, SiteError) as error:
        sys.exit(f"error: {error}")
    except KeyboardInterrupt:
        sys.exit(130)
