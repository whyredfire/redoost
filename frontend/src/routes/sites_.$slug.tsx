import {
  ApiError,
  errorMessage,
  expired,
  formatBytes,
  online,
} from "@redoost/shared";
import type { Deployment, SiteFile } from "@redoost/shared";
import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/solid-router";
import { For, Show, createSignal, untrack } from "solid-js";

import { DangerAction } from "@/components/danger-action";
import { ExpirySelect } from "@/components/expiry-select";
import { FolderDrop } from "@/components/folder-drop";
import { ArrowLeft } from "@/components/icons";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteAddress } from "@/components/site-address";
import { SiteDescription } from "@/components/site-description";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { VersionList } from "@/components/version-list";
import { api } from "@/lib/api";
import { formatDate, formatTime, siteUrl } from "@/lib/format";
import {
  clearSession,
  loadSession,
  loadSignedIn,
  loadToken,
} from "@/lib/session";
import { usePageDrop, useUpload } from "@/lib/upload";

const expiryNote = (site: Deployment) => {
  if (!site.expires_at) {
    return "Stays online until you take it offline.";
  }

  if (expired(site)) {
    return `Expired on ${formatDate(site.expires_at)}. Pick a new date, or never, to put it back.`;
  }

  return `Goes offline on ${formatDate(site.expires_at)} at ${formatTime(site.expires_at)}.`;
};

const statusLabel = (site: Deployment) => {
  if (!site.enabled) {
    return "Offline";
  }

  return expired(site) ? "Expired" : "Online";
};

interface ExpirySectionProps {
  site: Deployment;
  onSave: (expiresAt: string | null) => Promise<void>;
}

const ExpirySection = (props: ExpirySectionProps) => {
  const [expiresAt, setExpiresAt] = createSignal(
    untrack(() => props.site.expires_at)
  );

  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const save = async () => {
    setSaving(true);
    setError("");

    try {
      await props.onSave(expiresAt());
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="bg-card shadow-raised space-y-3 rounded-xl px-4 py-3">
      <h2 class="font-medium">Expires</h2>
      <ExpirySelect
        value={expiresAt()}
        onChange={(value) => setExpiresAt(value)}
        disabled={saving()}
      />
      <p class="text-muted-foreground">{expiryNote(props.site)}</p>
      <Show when={error()}>
        <p role="alert" class="text-destructive">
          {error()}
        </p>
      </Show>
      <Show when={expiresAt() !== props.site.expires_at}>
        <Button size="sm" disabled={saving()} onClick={save}>
          {saving() ? "Saving…" : "Save"}
        </Button>
      </Show>
    </section>
  );
};

const loadSite = (slug: string) =>
  loadSignedIn(async (token) => {
    try {
      const [site, versions] = await Promise.all([
        api(token).readDeployment(slug),
        api(token).readVersions(slug),
      ]);

      return { site, versions };
    } catch (error) {
      if (error instanceof ApiError && [403, 404].includes(error.status)) {
        throw notFound();
      }

      throw error;
    }
  });

const SitePage = () => {
  const loaded = Route.useLoaderData();
  const site = () => loaded()?.site ?? null;
  const router = useRouter();
  const navigate = useNavigate();
  const upload = useUpload();
  const [switching, setSwitching] = createSignal(false);
  const [switchError, setSwitchError] = createSignal("");

  const update = (files: SiteFile[]) => {
    const current = site();

    if (!current) {
      return;
    }

    upload.selectUpdate(current.slug, files);
    navigate({ to: "/publish" });
  };

  const dragging = usePageDrop(() => site() !== null && !upload.busy, update);

  const slug = () => {
    const current = site();

    if (!current) {
      throw new Error("No site is shown");
    }

    return current.slug;
  };

  const change = async <T,>(run: (token: string) => Promise<T>) => {
    const token = loadToken();

    if (!token) {
      return;
    }

    await run(token);
    await router.invalidate();
  };

  const describe = (description: string) =>
    change((token) => api(token).changeDeployment(slug(), { description }));

  const expire = (expires_at: string | null) =>
    change((token) => api(token).changeDeployment(slug(), { expires_at }));

  const restore = (id: string) =>
    change((token) => api(token).restoreVersion(slug(), id));

  const describeVersionOf = (id: string, description: string) =>
    change((token) => api(token).describeVersion(slug(), id, description));

  const removeVersion = (id: string) =>
    change((token) => api(token).deleteVersion(slug(), id));

  const prune = () => change((token) => api(token).pruneVersions(slug()));

  const toggle = async (enabled: boolean) => {
    const token = loadToken();

    if (!token) {
      return;
    }

    setSwitching(true);
    setSwitchError("");

    try {
      await api(token).changeDeployment(slug(), { enabled });
      await router.invalidate();
    } catch (error) {
      setSwitchError(errorMessage(error));
    } finally {
      setSwitching(false);
    }
  };

  const remove = async () => {
    const token = loadToken();

    if (!token) {
      return;
    }

    const removed = slug();
    await api(token).deleteDeployment(removed);

    if (loadSession()?.deployment.slug === removed) {
      clearSession();
    }

    await navigate({ to: "/sites" });
  };

  return (
    <Show
      when={site()}
      fallback={
        <SignInPrompt
          title="Sign in to see this site"
          description="Sites you publish while signed in are listed here."
        />
      }
    >
      {(shown) => {
        const url = () => siteUrl(shown().slug);
        const live = () => online(shown());

        const details = () => {
          const current = shown();

          return [
            {
              label: "Files",
              value: current.file_count.toLocaleString(),
            },
            { label: "Size", value: formatBytes(current.total_size) },
            {
              label: "Storage",
              value: `${formatBytes(current.storage_size)} · ${current.version_count} ${current.version_count === 1 ? "version" : "versions"}`,
            },
            { label: "Published", value: formatDate(current.created_at) },
            {
              label: "Expires",
              value: current.expires_at
                ? formatDate(current.expires_at)
                : "Never",
            },
            { label: "Status", value: statusLabel(current) },
          ];
        };

        return (
          <>
            <Link
              to="/sites"
              class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
            >
              <ArrowLeft class="size-4" />
              Your sites
            </Link>
            <h1 class="mt-6 font-mono text-2xl font-semibold tracking-tight break-all sm:text-3xl">
              {shown().slug}
            </h1>
            <div class="mt-2">
              <SiteDescription
                description={shown().description}
                onSave={describe}
              />
            </div>

            <div class="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="space-y-4">
                <SiteAddress slug={shown().slug} live={live()} />
                <Show when={live() && url()}>
                  {(href) => <SitePreview url={href()} />}
                </Show>
                <section
                  id="update"
                  aria-label="Update"
                  class="scroll-mt-20 pt-6"
                >
                  <Show
                    when={!upload.busy}
                    fallback={
                      <p class="text-muted-foreground rounded-xl border px-4 py-6 text-center text-sm">
                        Wait for the current upload to finish.
                      </p>
                    }
                  >
                    <FolderDrop
                      prompt="Drop a new version to update it"
                      dragging={dragging()}
                      limits={upload.limits}
                      error={upload.message}
                      checks={upload.checks}
                      onFiles={update}
                      onError={upload.showError}
                      onDismiss={upload.clearFiles}
                    />
                  </Show>
                </section>
                <Show when={(loaded()?.versions.length ?? 0) > 0}>
                  <section aria-label="Versions" class="pt-6">
                    <VersionList
                      versions={loaded()?.versions ?? []}
                      busy={upload.busy}
                      onRestore={restore}
                      onDescribe={describeVersionOf}
                      onDelete={removeVersion}
                      onPrune={prune}
                    />
                  </section>
                </Show>
              </div>

              <aside class="space-y-4 text-sm">
                <section class="bg-card shadow-raised rounded-xl">
                  <h2 class="border-b px-4 py-3 font-medium">Details</h2>
                  <dl class="divide-y">
                    <For each={details()}>
                      {(row) => (
                        <div class="flex justify-between gap-4 px-4 py-2.5">
                          <dt class="text-muted-foreground">{row.label}</dt>
                          <dd class="font-mono">{row.value}</dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </section>
                <section class="bg-card shadow-raised space-y-2 rounded-xl px-4 py-3">
                  <div class="flex items-center justify-between gap-4">
                    <h2 class="font-medium">Online</h2>
                    <Switch
                      checked={shown().enabled}
                      disabled={switching()}
                      onCheckedChange={toggle}
                      aria-label="Online"
                    />
                  </div>
                  <p class="text-muted-foreground">
                    {shown().enabled
                      ? "Visitors can reach it. Turning it off takes up to a minute."
                      : "Visitors see “Site not found”. Its files and address are kept."}
                  </p>
                  <Show when={switchError()}>
                    <p role="alert" class="text-destructive">
                      {switchError()}
                    </p>
                  </Show>
                </section>
                <Show when={shown().slug} keyed>
                  {(_slug) => <ExpirySection site={shown()} onSave={expire} />}
                </Show>
                <DangerAction
                  title="Delete site"
                  description="Deletes the site and its files."
                  question="Delete this site?"
                  warning="It will stop working and its files will be removed. This can't be undone."
                  action="Delete site"
                  onConfirm={remove}
                />
              </aside>
            </div>
          </>
        );
      }}
    </Show>
  );
};

export const Route = createFileRoute("/sites_/$slug")({
  loader: ({ params }) => loadSite(params.slug),
  head: ({ params }) => ({ meta: [{ title: `${params.slug} · redoost` }] }),
  component: SitePage,
  errorComponent: () => (
    <p role="alert" class="text-destructive text-sm">
      This site couldn't be loaded. Try again in a moment.
    </p>
  ),
});
