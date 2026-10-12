import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Globe, Search } from "lucide-react";
import { useState } from "react";
import { CliCommand } from "@/components/cli-command";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteList } from "@/components/site-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  changeDeployment,
  deleteDeployment,
  listDeployments,
} from "@/lib/deploy";
import {
  clearSession,
  clearToken,
  loadSession,
  loadToken,
  useToken,
} from "@/lib/session";
import { useUpload } from "@/lib/upload";

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "Your sites · redoost" }] }),
  loader: loadSites,
  component: SitesPage,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Your sites couldn't be loaded. Try again in a moment.
    </p>
  ),
});

async function loadSites() {
  const token = loadToken();
  if (!token) return [];
  try {
    const deployments = await listDeployments(token);
    return deployments;
  } catch (error) {
    // Expired or unknown, so the page asks to sign in again
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return [];
    }
    throw error;
  }
}

function SitesPage() {
  const sites = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { busy, startUpdate } = useUpload();
  const token = useToken();
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const shown = sites.filter((site) => site.slug.includes(search));

  function updateSite(slug: string) {
    startUpdate(slug);
    navigate({ to: "/" });
  }

  async function toggleSite(slug: string, enabled: boolean) {
    const token = loadToken();
    if (!token) return;
    await changeDeployment(slug, enabled, token);
    await router.invalidate();
  }

  async function deleteSite(slug: string) {
    const token = loadToken();
    if (!token) return;
    await deleteDeployment(slug, token);
    // The publish page would otherwise still show the deleted site as live
    if (loadSession()?.deployment.slug === slug) clearSession();
    await router.invalidate();
  }

  return (
    <>
      <PageHeading title="Your sites">
        Everything you've published, live until you delete it.
      </PageHeading>
      {!token ? (
        <SignInPrompt
          title="Sign in to see your sites"
          description="Sites you publish while signed in are listed here."
        />
      ) : sites.length > 0 ? (
        <div className="space-y-4">
          {sites.length > 5 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sites"
                aria-label="Search sites"
                className="h-10 rounded-xl pl-10 font-mono [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
          )}
          {shown.length > 0 ? (
            <SiteList
              sites={shown}
              canUpdate={!busy}
              onUpdate={updateSite}
              onToggle={toggleSite}
              onDelete={deleteSite}
            />
          ) : (
            <p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
              No sites match <span className="font-mono">{query.trim()}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center rounded-xl border px-6 py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Globe className="size-5 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">No sites yet</p>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Publish your first site here, or from the command line.
            </p>
            <Button asChild>
              <Link to="/">Publish a site</Link>
            </Button>
          </div>
          <CliCommand />
        </div>
      )}
    </>
  );
}
