import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Route, Switch } from "wouter";
import { PublishCard } from "@/components/publish-card";
import { RotatingWord } from "@/components/rotating-word";
import { SiteList } from "@/components/site-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { TokenDialog } from "@/components/token-dialog";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  deleteDeployment,
  listDeployments,
  type Deployment,
} from "@/lib/deploy";
import {
  clearSession,
  clearToken,
  loadSession,
  loadToken,
  saveToken,
} from "@/lib/session";

function navClass(active: boolean) {
  return `text-sm transition-colors hover:text-foreground ${active ? "font-medium text-foreground" : "text-muted-foreground"}`;
}

export function App() {
  const [sites, setSites] = useState<Deployment[]>([]);

  async function refreshSites() {
    const token = loadToken();
    if (!token) return;
    try {
      const deployments = await listDeployments(token);
      setSites(deployments);
    } catch (error) {
      // The token is unknown to the API, so the next publish starts a new one
      if (error instanceof ApiError && error.status === 403) {
        clearToken();
        setSites([]);
      }
    }
  }

  useEffect(() => {
    void refreshSites();
  }, []);

  async function importToken(token: string) {
    // Listing checks the token before it replaces the current one
    const deployments = await listDeployments(token);
    saveToken(token);
    setSites(deployments);
  }

  async function deleteSite(slug: string) {
    const token = loadToken();
    if (!token) return;
    await deleteDeployment(slug, token);
    // The publish page would otherwise still show the deleted site as live
    if (loadSession()?.deployment.slug === slug) clearSession();
    await refreshSites();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
              r.
            </span>
            redoost
          </Link>
          <nav className="flex gap-5">
            <Link href="/" className={navClass}>
              Publish
            </Link>
            <Link href="/sites" className={navClass}>
              Sites
            </Link>
          </nav>
          <div className="ml-auto flex gap-1">
            <TokenDialog onImport={importToken} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:py-12">
        <Switch>
          <Route path="/sites">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight">
                Your sites
              </h1>
              <p className="mt-1 text-muted-foreground">
                Sites published from this browser, or from the token you
                imported.
              </p>
            </div>
            {sites.length > 0 ? (
              <SiteList sites={sites} onDelete={deleteSite} />
            ) : (
              <div className="rounded-xl border border-dashed px-6 py-14 text-center">
                <Globe className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-4 font-medium">No sites yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publish your first site, or import a token from another
                  device.
                </p>
                <Button className="mt-6" asChild>
                  <Link href="/">Publish a site</Link>
                </Button>
              </div>
            )}
          </Route>
          <Route>
            {/* The card fills what's left of the first screen */}
            <div className="[--publish-height:max(26rem,calc(100svh-21rem))]">
              <div className="mb-8 text-center">
                <h1
                  className="text-3xl font-semibold tracking-tight sm:text-4xl"
                  aria-label="A home for your static site"
                >
                  <span aria-hidden>
                    A home for your{" "}
                    <RotatingWord
                      words={[
                        "static site",
                        "portfolio",
                        "landing page",
                        "docs",
                        "side project",
                      ]}
                    />
                  </span>
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Drop a built site and get a shareable address. No account or
                  build step required.
                </p>
              </div>
              <PublishCard onPublished={refreshSites} />
            </div>
          </Route>
        </Switch>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-5 py-6 text-sm text-muted-foreground">
          Open source under the MIT license ·{" "}
          <a
            className="underline-offset-4 hover:text-foreground hover:underline"
            href="https://github.com/whyredfire/redoost"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
