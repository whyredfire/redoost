import { online, slugsPerRequest } from "@redoost/shared";
import type { Deployment, Usage } from "@redoost/shared";
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
import { api } from "@/lib/api";
import { installUrl } from "@/lib/config";
import { loadSignedIn, loadToken, useToken } from "@/lib/session";

type Send = (batch: string[]) => Promise<object>;

const sendBatch = async (batch: string[], send: Send) => {
  try {
    await send(batch);

    return [];
  } catch {
    return batch;
  }
};

const inBatches: (slugs: string[], send: Send) => Promise<string[]> = async (
  slugs,
  send
) => {
  if (slugs.length === 0) {
    return [];
  }

  const failed = await sendBatch(slugs.slice(0, slugsPerRequest), send);

  return [...failed, ...(await inBatches(slugs.slice(slugsPerRequest), send))];
};

const loadSites = async () => {
  const loaded = await loadSignedIn(async (token) => {
    const [sites, usage] = await Promise.all([
      api(token).listDeployments(),
      api(token).readUsage(),
    ]);

    return { sites, usage };
  });

  return loaded ?? { sites: [], usage: null };
};

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

const SitesPage = () => {
  const loaded = Route.useLoaderData();
  const sites = () => loaded().sites;
  const token = useToken();
  const [query, setQuery] = createSignal("");
  const [status, setStatus] = createSignal<Status>("all");
  const [order, setOrder] = createSignal<Order>("newest");
  const [selecting, setSelecting] = createSignal<Set<string> | null>(null);
  const router = useRouter();

  const shown = createMemo(() => {
    const search = query().trim().toLowerCase();

    return sites()
      .filter(
        (site) =>
          site.slug.includes(search) ||
          site.description.toLowerCase().includes(search)
      )
      .filter(
        (site) => status() === "all" || online(site) === (status() === "online")
      )
      .toSorted(orders[order()]);
  });

  const selected = createMemo(() =>
    shown().filter((site) => selecting()?.has(site.slug))
  );

  const toggle = (slug: string) => {
    setSelecting((current) => {
      const next = new Set(current);

      if (!next.delete(slug)) {
        next.add(slug);
      }

      return next;
    });
  };

  const deleteSelected = async () => {
    const stored = loadToken();

    if (!stored) {
      throw new Error("Sign in again to delete these sites.");
    }

    const slugs = selected().map((site) => site.slug);

    const failed = await inBatches(slugs, (batch) =>
      api(stored).deleteDeployments(batch)
    );

    await router.invalidate();

    if (failed.length > 0) {
      setSelecting(new Set(failed));
      throw new Error(
        `${failed.length} of ${slugs.length} couldn't be deleted. Try again.`
      );
    }

    setSelecting(null);
  };

  const switchSelected = async (enabled: boolean) => {
    const stored = loadToken();

    if (!stored) {
      throw new Error("Sign in again to change these sites.");
    }

    const slugs = selected()
      .filter((site) => site.enabled !== enabled)
      .map((site) => site.slug);

    const failed = await inBatches(slugs, (batch) =>
      api(stored).changeDeployments(batch, enabled)
    );

    await router.invalidate();

    if (failed.length > 0) {
      throw new Error(
        `${failed.length} of ${slugs.length} couldn't be changed. Try again.`
      );
    }
  };

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
                    <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
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
                      new Set(all ? shown().map((site) => site.slug) : [])
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
                  <p class="text-muted-foreground rounded-xl border px-4 py-10 text-center text-sm">
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
};

interface SidebarProps {
  sites: Deployment[];
  usage: Usage | null;
}

const Sidebar = (props: SidebarProps) => {
  const offline = () => props.sites.filter((site) => !online(site)).length;

  return (
    <aside class="space-y-4 text-sm">
      <Show when={props.usage}>
        {(usage) => (
          <section class="bg-card shadow-raised space-y-3 rounded-xl px-4 py-3">
            <h2 class="font-medium">Storage</h2>
            <StorageUsage usage={usage()} />
          </section>
        )}
      </Show>
      <section class="bg-card shadow-raised space-y-1 rounded-xl px-4 py-3">
        <h2 class="font-medium">Sites</h2>
        <p class="text-muted-foreground font-mono">
          {props.sites.length - offline()} online · {offline()} offline
        </p>
      </section>
      <section class="bg-card shadow-raised space-y-3 rounded-xl px-4 py-3">
        <h2 class="font-medium">From the terminal</h2>
        <CliCommand command="redoost list" variant="compact" />
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          class="text-muted-foreground hover:text-foreground inline-block underline-offset-4 hover:underline"
        >
          Install the CLI
        </a>
      </section>
    </aside>
  );
};

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "Your sites · redoost" }] }),
  loader: loadSites,
  component: SitesPage,
  errorComponent: () => (
    <p role="alert" class="text-destructive text-sm">
      Your sites couldn't be loaded. Try again in a moment.
    </p>
  ),
});
