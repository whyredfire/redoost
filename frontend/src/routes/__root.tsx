import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { AgentPromptButton } from "@/components/agent-prompt-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TokenDialog } from "@/components/token-dialog";
import { Button } from "@/components/ui/button";
import { listDeployments } from "@/lib/deploy";
import { saveToken } from "@/lib/session";
import { useUpload } from "@/lib/upload";

export const Route = createRootRoute({
  component: Layout,
  notFoundComponent: NotFound,
});

const navClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground";

const footerLink = "underline-offset-4 hover:text-foreground hover:underline";

function Layout() {
  const { busy, startOver } = useUpload();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();

  // The header's links to / start a fresh publish, unless an upload is running
  function startFresh() {
    if (!busy) startOver();
  }

  async function importToken(token: string) {
    // Listing checks the token before it replaces the current one
    await listDeployments(token);
    saveToken(token);
    await router.invalidate();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold"
            onClick={startFresh}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
              r.
            </span>
            redoost
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
            <TokenDialog onImport={importToken} />
            <ThemeToggle />
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
              href="https://github.com/whyredfire/redoost"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>{" "}
            · {import.meta.env.VITE_VERSION ?? "dev"}
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
