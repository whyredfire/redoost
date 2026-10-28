import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Globe, Search } from "lucide-react";
import { useState } from "react";
import { CliCommand } from "@/components/cli-command";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteList } from "@/components/site-list";
import { SiteSelection } from "@/components/site-selection";
import { StorageUsage } from "@/components/storage-usage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  deleteDeployments,
  listDeployments,
  readUsage,
  type Deployment,
  type Usage,
} from "@/lib/deploy";
import { repository } from "@/lib/config";
import { clearToken, loadToken, useToken } from "@/lib/session";

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
  if (!token) return { sites: [], usage: null };
  try {
    const [sites, usage] = await Promise.all([
      listDeployments(token),
      readUsage(token),
    ]);
    return { sites, usage };
  } catch (error) {
    // Expired or unknown, so the page asks to sign in again
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return { sites: [], usage: null };
    }
    throw error;
  }
}

type Status = "all" | "online" | "offline";
type Order = "newest" | "largest" | "name";

const orders: Record<Order, (a: Deployment, b: Deployment) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  largest: (a, b) => b.total_size - a.total_size,
  name: (a, b) => a.slug.localeCompare(b.slug),
};

function SitesPage() {
  const { sites, usage } = Route.useLoaderData();
  const token = useToken();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [order, setOrder] = useState<Order>("newest");
  // Sites picked to delete together, or null when not picking
  const [selecting, setSelecting] = useState<Set<string> | null>(null);
  const router = useRouter();
  const search = query.trim().toLowerCase();
  const shown = sites
    .filter(
      (site) =>
        site.slug.includes(search) ||
        site.description.toLowerCase().includes(search),
    )
    .filter(
      (site) => status === "all" || site.enabled === (status === "online"),
    )
    .toSorted(orders[order]);
  // Only what's listed, so a filter can't hide a site that would be deleted
  const selected = shown
    .filter((site) => selecting?.has(site.slug))
    .map((site) => site.slug);

  function toggle(slug: string) {
    setSelecting((current) => {
      const next = new Set(current);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }

  async function deleteSelected() {
    const token = loadToken();
    if (!token) throw new Error("Sign in again to delete these sites.");
    const failed = await deleteDeployments(selected, token);
    await router.invalidate();
    if (failed.length > 0) {
      setSelecting(new Set(failed));
      throw new Error(
        `${failed.length} of ${selected.length} couldn't be deleted. Try again.`,
      );
    }
    setSelecting(null);
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
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {sites.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                {sites.length > 5 && (
                  <>
                    <div className="relative flex-1">
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
                    <div className="flex gap-2">
                      <Select
                        value={status}
                        onValueChange={(value) => setStatus(value as Status)}
                      >
                        <SelectTrigger
                          className="h-10! flex-1 rounded-xl sm:w-32"
                          aria-label="Show"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All sites</SelectItem>
                          <SelectItem value="online">Online</SelectItem>
                          <SelectItem value="offline">Offline</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={order}
                        onValueChange={(value) => setOrder(value as Order)}
                      >
                        <SelectTrigger
                          className="h-10! flex-1 rounded-xl sm:w-32"
                          aria-label="Sort by"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest</SelectItem>
                          <SelectItem value="largest">Largest</SelectItem>
                          <SelectItem value="name">Name</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {!selecting && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl sm:ml-auto"
                    onClick={() => setSelecting(new Set())}
                  >
                    Select
                  </Button>
                )}
              </div>
              {selecting && (
                <SiteSelection
                  shown={shown.map((site) => site.slug)}
                  selected={selected}
                  onSelectAll={(all) =>
                    setSelecting(
                      new Set(all ? shown.map((site) => site.slug) : []),
                    )
                  }
                  onCancel={() => setSelecting(null)}
                  onDelete={deleteSelected}
                />
              )}
              {shown.length > 0 ? (
                <SiteList
                  sites={shown}
                  selected={selecting ? new Set(selected) : undefined}
                  onToggle={toggle}
                />
              ) : (
                <p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
                  No matching sites
                </p>
              )}
            </div>
          ) : (
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
          )}
          <Sidebar sites={sites} usage={usage} />
        </div>
      )}
    </>
  );
}

type SidebarProps = { sites: Deployment[]; usage: Usage | null };

function Sidebar({ sites, usage }: SidebarProps) {
  const offline = sites.filter((site) => !site.enabled).length;

  return (
    <aside className="space-y-4 text-sm">
      {usage && (
        <section className="space-y-3 rounded-xl border px-4 py-3">
          <h2 className="font-medium">Storage</h2>
          <StorageUsage usage={usage} />
        </section>
      )}
      <section className="space-y-1 rounded-xl border px-4 py-3">
        <h2 className="font-medium">Sites</h2>
        <p className="font-mono text-muted-foreground">
          {sites.length - offline} online · {offline} offline
        </p>
      </section>
      <section className="space-y-3 rounded-xl border px-4 py-3">
        <h2 className="font-medium">From the terminal</h2>
        <CliCommand command="redoost list" variant="compact" />
        <a
          href={`${repository}/tree/main/cli#readme`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Install the CLI
        </a>
      </section>
    </aside>
  );
}
