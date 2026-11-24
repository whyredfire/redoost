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
import { ApiError } from "@/lib/api";
import {
  changeDeployment,
  deleteDeployment,
  deleteVersion,
  describeVersion,
  expired,
  online,
  pruneVersions,
  readDeployment,
  readVersions,
  restoreVersion,
  type Deployment,
} from "@/lib/deploy";
import {
  errorMessage,
  formatBytes,
  formatDate,
  formatTime,
  siteUrl,
} from "@/lib/format";
import {
  clearSession,
  loadSession,
  loadSignedIn,
  loadToken,
} from "@/lib/session";
import type { SiteFile } from "@/lib/site-files";
import { usePageDrop, useUpload } from "@/lib/upload";

export const Route = createFileRoute("/sites_/$slug")({
  loader: ({ params }) => loadSite(params.slug),
  head: ({ params }) => ({ meta: [{ title: `${params.slug} · redoost` }] }),
  component: SitePage,
  errorComponent: () => (
    <p role="alert" class="text-sm text-destructive">
      This site couldn't be loaded. Try again in a moment.
    </p>
  ),
});

type ExpirySectionProps = {
  site: Deployment;
  onSave: (expiresAt: string | null) => Promise<void>;
};

// Keyed by slug where it's used, so the draft follows the site shown
function ExpirySection(props: ExpirySectionProps) {
  // Seeded once, like useState: a reload after saving another setting keeps the draft
  const [expiresAt, setExpiresAt] = createSignal(
    untrack(() => props.site.expires_at),
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await props.onSave(expiresAt());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="space-y-3 rounded-xl bg-card shadow-raised px-4 py-3">
      <h2 class="font-medium">Expires</h2>
      <ExpirySelect
        value={expiresAt()}
        onChange={(value) => setExpiresAt(value)}
        disabled={saving()}
      />
      <p class="text-muted-foreground">
        {!props.site.expires_at
          ? "Stays online until you take it offline."
          : expired(props.site)
            ? `Expired on ${formatDate(props.site.expires_at)}. Pick a new date, or never, to put it back.`
            : `Goes offline on ${formatDate(props.site.expires_at)} at ${formatTime(props.site.expires_at)}.`}
      </p>
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
}

function loadSite(slug: string) {
  return loadSignedIn(async (token) => {
    try {
      const [site, versions] = await Promise.all([
        readDeployment(slug, token),
        readVersions(slug, token),
      ]);
      return { site, versions };
    } catch (error) {
      // Other people's sites look the same as missing ones
      if (error instanceof ApiError && [403, 404].includes(error.status)) {
        throw notFound();
      }
      throw error;
    }
  });
}

function SitePage() {
  const loaded = Route.useLoaderData();
  const site = () => loaded()?.site ?? null;
  const router = useRouter();
  const navigate = useNavigate();
  const upload = useUpload();
  const [switching, setSwitching] = createSignal(false);
  const [switchError, setSwitchError] = createSignal("");

  function update(files: SiteFile[]) {
    const current = site();
    if (!current) return;
    upload.selectUpdate(current.slug, files);
    navigate({ to: "/publish" });
  }

  const dragging = usePageDrop(() => site() !== null && !upload.busy, update);

  // Read when called, so the handlers act on the site shown then
  const slug = () => site()!.slug;

  async function change(run: (token: string) => Promise<unknown>) {
    const token = loadToken();
    if (!token) return;
    await run(token);
    await router.invalidate();
  }

  const describe = (description: string) =>
    change((token) => changeDeployment(slug(), { description }, token));
  const expire = (expires_at: string | null) =>
    change((token) => changeDeployment(slug(), { expires_at }, token));
  const restore = (id: string) =>
    change((token) => restoreVersion(slug(), id, token));
  const describeVersionOf = (id: string, description: string) =>
    change((token) => describeVersion(slug(), id, description, token));
  const removeVersion = (id: string) =>
    change((token) => deleteVersion(slug(), id, token));
  const prune = () => change((token) => pruneVersions(slug(), token));

  async function toggle(enabled: boolean) {
    const token = loadToken();
    if (!token) return;
    setSwitching(true);
    setSwitchError("");
    try {
      await changeDeployment(slug(), { enabled }, token);
      await router.invalidate();
    } catch (cause) {
      setSwitchError(errorMessage(cause));
    } finally {
      setSwitching(false);
    }
  }

  async function remove() {
    const token = loadToken();
    if (!token) return;
    const removed = slug();
    await deleteDeployment(removed, token);
    // The publish page would otherwise still show the deleted site as live
    if (loadSession()?.deployment.slug === removed) clearSession();
    await navigate({ to: "/sites" });
  }

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
      {(site) => {
        const url = () => siteUrl(site().slug);
        const live = () => online(site());
        const details = () => [
          {
            label: "Files",
            value: site().file_count.toLocaleString(),
          },
          { label: "Size", value: formatBytes(site().total_size) },
          {
            label: "Storage",
            value: `${formatBytes(site().storage_size)} · ${site().version_count} ${site().version_count === 1 ? "version" : "versions"}`,
          },
          { label: "Published", value: formatDate(site().created_at) },
          {
            label: "Expires",
            value: site().expires_at ? formatDate(site().expires_at!) : "Never",
          },
          {
            label: "Status",
            value: !site().enabled
              ? "Offline"
              : expired(site())
                ? "Expired"
                : "Online",
          },
        ];

        return (
          <>
            <Link
              to="/sites"
              class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft class="size-4" />
              Your sites
            </Link>
            <h1 class="mt-6 font-mono text-2xl font-semibold tracking-tight break-all sm:text-3xl">
              {site().slug}
            </h1>
            <div class="mt-2">
              <SiteDescription
                description={site().description}
                onSave={describe}
              />
            </div>

            <div class="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="space-y-4">
                <SiteAddress slug={site().slug} live={live()} />
                <Show when={live() && url()}>
                  {(url) => <SitePreview url={url()} />}
                </Show>
                <section
                  id="update"
                  aria-label="Update"
                  class="scroll-mt-20 pt-6"
                >
                  <Show
                    when={!upload.busy}
                    fallback={
                      <p class="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">
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
                      versions={loaded()!.versions}
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
                <section class="rounded-xl bg-card shadow-raised">
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
                <section class="space-y-2 rounded-xl bg-card shadow-raised px-4 py-3">
                  <div class="flex items-center justify-between gap-4">
                    <h2 class="font-medium">Online</h2>
                    <Switch
                      checked={site().enabled}
                      disabled={switching()}
                      onChange={toggle}
                      aria-label="Online"
                    />
                  </div>
                  <p class="text-muted-foreground">
                    {site().enabled
                      ? "Visitors can reach it. Turning it off takes up to a minute."
                      : "Visitors see “Site not found”. Its files and address are kept."}
                  </p>
                  <Show when={switchError()}>
                    <p role="alert" class="text-destructive">
                      {switchError()}
                    </p>
                  </Show>
                </section>
                <Show when={site().slug} keyed>
                  {(_slug) => <ExpirySection site={site()} onSave={expire} />}
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
}
