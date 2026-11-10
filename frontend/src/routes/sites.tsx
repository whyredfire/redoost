import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Globe, Search } from "lucide-react";
import { useState } from "react";
import { Choice } from "@/components/choice";
import { CliCommand } from "@/components/cli-command";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteList } from "@/components/site-list";
import { SiteSelection } from "@/components/site-selection";
import { StorageUsage } from "@/components/storage-usage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changeDeployments,
  deleteDeployments,
  listDeployments,
  online,
  readUsage,
  type Deployment,
  type Usage,
} from "@/lib/deploy";
import { installUrl } from "@/lib/config";
import { loadSignedIn, loadToken, useToken } from "@/lib/session";

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
  const loaded = await loadSignedIn(async (token) => {
    const [sites, usage] = await Promise.all([
      listDeployments(token),
      readUsage(token),
    ]);
    return { sites, usage };
  });
  return loaded ?? { sites: [], usage: null };
}

const statuses = [
  ["all", "All sites"],
  ["online", "Online"],
  ["offline", "Offline"],
] as const;
const orderNames = [
  ["newest", "Newest"],
  ["largest", "Largest"],
  ["name", "Name"],
] as const;

type Status = (typeof statuses)[number][0];
type Order = (typeof orderNames)[number][0];

const orders: Record<Order, (a: Deployment, b: Deployment) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  largest: (a, b) => b.storage_size - a.storage_size,
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
      (site) => status === "all" || online(site) === (status === "online"),
    )
    .toSorted(orders[order]);
  // Only what's listed, so a filter can't hide a site that would be deleted
  const selected = shown.filter((site) => selecting?.has(site.slug));

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
    const slugs = selected.map((site) => site.slug);
    const failed = await deleteDeployments(slugs, token);
    await router.invalidate();
    if (failed.length > 0) {
      setSelecting(new Set(failed));
      throw new Error(
        `${failed.length} of ${slugs.length} couldn't be deleted. Try again.`,
      );
    }
    setSelecting(null);
  }

  // The sites stay selected, to change them back or delete them next
  async function switchSelected(enabled: boolean) {
    const token = loadToken();
    if (!token) throw new Error("Sign in again to change these sites.");
    const slugs = selected
      .filter((site) => site.enabled !== enabled)
      .map((site) => site.slug);
    const failed = await changeDeployments(slugs, enabled, token);
    await router.invalidate();
    if (failed.length > 0) {
      throw new Error(
        `${failed.length} of ${slugs.length} couldn't be changed. Try again.`,
      );
    }
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
                        className="pl-10 font-mono [&::-webkit-search-cancel-button]:hidden"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Choice
                        label="Show"
                        options={statuses}
                        value={status}
                        onChange={setStatus}
                      />
                      <Choice
                        label="Sort by"
                        options={orderNames}
                        value={order}
                        onChange={setOrder}
                      />
                    </div>
                  </>
                )}
                {!selecting && (
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:ml-auto"
                    onClick={() => setSelecting(new Set())}
                  >
                    Select
                  </Button>
                )}
              </div>
              {selecting && (
                <SiteSelection
                  shownCount={shown.length}
                  selected={selected}
                  onSelectAll={(all) =>
                    setSelecting(
                      new Set(all ? shown.map((site) => site.slug) : []),
                    )
                  }
                  onCancel={() => setSelecting(null)}
                  onSwitch={switchSelected}
                  onDelete={deleteSelected}
                />
              )}
              {shown.length > 0 ? (
                <SiteList
                  sites={shown}
                  selected={selecting ?? undefined}
                  onToggle={toggle}
                />
              ) : (
                <p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
                  No matching sites
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Globe}
              title="No sites yet"
              description="Publish your first site here, or from the command line."
            >
              <Button asChild>
                <Link to="/">Publish a site</Link>
              </Button>
            </EmptyState>
          )}
          <Sidebar sites={sites} usage={usage} />
        </div>
      )}
    </>
  );
}

type SidebarProps = { sites: Deployment[]; usage: Usage | null };

function Sidebar({ sites, usage }: SidebarProps) {
  const offline = sites.filter((site) => !online(site)).length;

  return (
    <aside className="space-y-4 text-sm">
      {usage && (
        <section className="space-y-3 rounded-xl bg-card shadow-raised px-4 py-3">
          <h2 className="font-medium">Storage</h2>
          <StorageUsage usage={usage} />
        </section>
      )}
      <section className="space-y-1 rounded-xl bg-card shadow-raised px-4 py-3">
        <h2 className="font-medium">Sites</h2>
        <p className="font-mono text-muted-foreground">
          {sites.length - offline} online · {offline} offline
        </p>
      </section>
      <section className="space-y-3 rounded-xl bg-card shadow-raised px-4 py-3">
        <h2 className="font-medium">From the terminal</h2>
        <CliCommand command="redoost list" variant="compact" />
        <a
          href={installUrl}
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
