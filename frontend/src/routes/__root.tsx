import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { AccountMenu } from "@/components/account-menu";
import { AgentPromptButton } from "@/components/agent-prompt-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { deleteAccount, signOut, signedInUser } from "@/lib/auth";
import { useToken } from "@/lib/session";
import { useUpload } from "@/lib/upload";

export const Route = createRootRoute({
  component: Layout,
  notFoundComponent: NotFound,
});

const navClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground";

const footerLink = "underline-offset-4 hover:text-foreground hover:underline";

const repository = "https://github.com/whyredfire/redoost";
const version: string = import.meta.env.VITE_VERSION || "dev";

// Releases link to their notes, and builds between them to their commit
function versionUrl(version: string) {
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return `${repository}/releases/tag/v${version}`;
  }
  const commit = /^\d+\.\d+\.\d+-([0-9a-f]{7,40})$/.exec(version)?.[1];
  return commit ? `${repository}/commit/${commit}` : null;
}

const versionLink = versionUrl(version);

function Layout() {
  const { busy, startOver } = useUpload();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const token = useToken();

  // The header's links to / start a fresh publish, unless an upload is running
  function startFresh() {
    if (!busy) startOver();
  }

  async function leave() {
    startOver();
    signOut();
    await navigate({ to: "/" });
    await router.invalidate();
  }

  async function removeAccount() {
    await deleteAccount();
    await leave();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5 sm:gap-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold"
            onClick={startFresh}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
              r.
            </span>
            {/* Phones show only the mark, so the header fits */}
            <span className="sr-only sm:not-sr-only">redoost</span>
          </Link>
          <nav className="flex gap-5">
            <Link
              to="/"
              className={`${navClass} ${pathname === "/publish" ? "font-medium text-foreground" : ""}`}
              activeOptions={{ exact: true }}
              onClick={startFresh}
            >
              Publish
            </Link>
            <Link to="/sites" className={navClass}>
              Sites
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <AgentPromptButton />
            <ThemeToggle />
            {token && (
              <AccountMenu
                user={signedInUser()}
                onSignOut={leave}
                onDelete={removeAccount}
              />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-x-4 gap-y-1 px-5 py-6 text-sm text-muted-foreground">
          <p>
            Open source under the MIT license ·{" "}
            <a
              className={footerLink}
              href={repository}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>{" "}
            ·{" "}
            <Link to="/privacy" className={footerLink}>
              Privacy Policy
            </Link>{" "}
            ·{" "}
            <Link to="/terms" className={footerLink}>
              Terms of Service
            </Link>{" "}
            ·{" "}
            {versionLink ? (
              <a
                className={footerLink}
                href={versionLink}
                target="_blank"
                rel="noreferrer"
              >
                {version}
              </a>
            ) : (
              version
            )}
          </p>
          <p className="whitespace-nowrap">
            Made by{" "}
            <a
              className={footerLink}
              href="https://github.com/whyredfire"
              target="_blank"
              rel="noreferrer"
            >
              Karan Parashar
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="py-14 text-center">
      <p className="font-medium">Page not found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        There's nothing at this address.
      </p>
      <Button className="mt-6" asChild>
        <Link to="/">Publish a site</Link>
      </Button>
    </div>
  );
}
