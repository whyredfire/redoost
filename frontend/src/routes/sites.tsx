import { Link, createFileRoute, useRouter } from "@tanstack/solid-router";
import { Show, createMemo, createSignal } from "solid-js";
import { Choice } from "@/components/choice";
import { CliCommand } from "@/components/cli-command";
import { EmptyState } from "@/components/empty-state";
import { Globe, Search } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteList } from "@/components/site-list";
import { SiteSelection } from "@/components/site-selection";
import { StorageUsage } from "@/components/storage-usage";
import { Button, buttonVariants } from "@/components/ui/button";
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
    <p role="alert" class="text-sm text-destructive">
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
  const loaded = Route.useLoaderData();
  const sites = () => loaded().sites;
  const token = useToken();
  const [query, setQuery] = createSignal("");
  const [status, setStatus] = createSignal<Status>("all");
  const [order, setOrder] = createSignal<Order>("newest");
  // Sites picked to delete together, or null when not picking
  const [selecting, setSelecting] = createSignal<Set<string> | null>(null);
  const router = useRouter();
  const shown = createMemo(() => {
    const search = query().trim().toLowerCase();
    return sites()
      .filter(
        (site) =>
          site.slug.includes(search) ||
          site.description.toLowerCase().includes(search),
      )
      .filter(
        (site) =>
          status() === "all" || online(site) === (status() === "online"),
      )
      .toSorted(orders[order()]);
  });
  // Only what's listed, so a filter can't hide a site that would be deleted
  const selected = createMemo(() =>
    shown().filter((site) => selecting()?.has(site.slug)),
  );

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
    const slugs = selected().map((site) => site.slug);
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
    const slugs = selected()
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
      <PageHeading
        title="Your sites"
        action={
          token() &&
          sites().length > 0 &&
          !selecting() && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelecting(new Set<string>())}
            >
              Select
            </Button>
          )
        }
      >
        Everything you've published, live until you delete it.
      </PageHeading>
      <Show
        when={token()}
        fallback={
          <SignInPrompt
            title="Sign in to see your sites"
            description="Sites you publish while signed in are listed here."
          />
        }
      >
        <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Show
            when={sites().length > 0}
            fallback={
              <EmptyState
                icon={Globe}
                title="No sites yet"
                description="Publish your first site here, or from the command line."
              >
                <Link to="/" class={buttonVariants()}>
                  Publish a site
                </Link>
              </EmptyState>
            }
          >
            <div class="space-y-4">
              <Show when={sites().length > 5}>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <div class="relative flex-1">
                    <Search class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={query()}
                      onInput={(event) => setQuery(event.currentTarget.value)}
                      placeholder="Search sites"
                      aria-label="Search sites"
                      class="pl-10 font-mono [&::-webkit-search-cancel-button]:hidden"
                    />
                  </div>
                  <div class="flex gap-2">
                    <Choice
                      label="Show"
                      options={statuses}
                      value={status()}
                      onChange={(value: Status) => setStatus(value)}
                    />
                    <Choice
                      label="Sort by"
                      options={orderNames}
                      value={order()}
                      onChange={(value: Order) => setOrder(value)}
                    />
                  </div>
                </div>
              </Show>
              <Show when={selecting()}>
                <SiteSelection
                  shownCount={shown().length}
                  selected={selected()}
                  onSelectAll={(all) =>
                    setSelecting(
                      new Set(all ? shown().map((site) => site.slug) : []),
                    )
                  }
                  onCancel={() => setSelecting(null)}
                  onSwitch={switchSelected}
                  onDelete={deleteSelected}
                />
              </Show>
              <Show
                when={shown().length > 0}
                fallback={
                  <p class="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
                    No matching sites
                  </p>
                }
              >
                <SiteList
                  sites={shown()}
                  selected={selecting() ?? undefined}
                  onToggle={toggle}
                />
              </Show>
            </div>
          </Show>
          <Sidebar sites={sites()} usage={loaded().usage} />
        </div>
      </Show>
    </>
  );
}

type SidebarProps = { sites: Deployment[]; usage: Usage | null };

function Sidebar(props: SidebarProps) {
  const offline = () => props.sites.filter((site) => !online(site)).length;

  return (
    <aside class="space-y-4 text-sm">
      <Show when={props.usage}>
        {(usage) => (
          <section class="space-y-3 rounded-xl bg-card shadow-raised px-4 py-3">
            <h2 class="font-medium">Storage</h2>
            <StorageUsage usage={usage()} />
          </section>
        )}
      </Show>
      <section class="space-y-1 rounded-xl bg-card shadow-raised px-4 py-3">
        <h2 class="font-medium">Sites</h2>
        <p class="font-mono text-muted-foreground">
          {props.sites.length - offline()} online · {offline()} offline
        </p>
      </section>
      <section class="space-y-3 rounded-xl bg-card shadow-raised px-4 py-3">
        <h2 class="font-medium">From the terminal</h2>
        <CliCommand command="redoost list" variant="compact" />
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          class="inline-block text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Install the CLI
        </a>
      </section>
    </aside>
  );
}
