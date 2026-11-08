import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Switch } from "@cloudflare/kumo/components/switch";
import { DangerAction } from "@/components/danger-action";
import { ExpirySelect } from "@/components/expiry-select";
import { FolderDrop } from "@/components/folder-drop";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteAddress } from "@/components/site-address";
import { SiteDescription } from "@/components/site-description";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
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
    <p role="alert" className="text-sm text-destructive">
      This site couldn't be loaded. Try again in a moment.
    </p>
  ),
});

type ExpirySectionProps = {
  site: Deployment;
  onSave: (expiresAt: string | null) => Promise<void>;
};

// Keyed by slug where it's used, so the draft follows the site shown
function ExpirySection({ site, onSave }: ExpirySectionProps) {
  const [expiresAt, setExpiresAt] = useState(site.expires_at);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(expiresAt);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border px-4 py-3">
      <h2 className="font-medium">Expires</h2>
      <ExpirySelect
        value={expiresAt}
        onChange={setExpiresAt}
        disabled={saving}
      />
      <p className="text-muted-foreground">
        {!site.expires_at
          ? "Stays online until you take it offline."
          : expired(site)
            ? `Expired on ${formatDate(site.expires_at)}. Pick a new date, or never, to put it back.`
            : `Goes offline on ${formatDate(site.expires_at)} at ${formatTime(site.expires_at)}.`}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {expiresAt !== site.expires_at && (
        <Button size="sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      )}
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
  const site = loaded?.site ?? null;
  const router = useRouter();
  const navigate = useNavigate();
  const { busy, message, checks, limits, selectUpdate, showError, clearFiles } =
    useUpload();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  function update(files: SiteFile[]) {
    if (!site) return;
    selectUpdate(site.slug, files);
    navigate({ to: "/publish" });
  }

  const dragging = usePageDrop(site !== null && !busy, update);

  if (!site) {
    return (
      <SignInPrompt
        title="Sign in to see this site"
        description="Sites you publish while signed in are listed here."
      />
    );
  }

  const { slug } = site;

  async function change(run: (token: string) => Promise<unknown>) {
    const token = loadToken();
    if (!token) return;
    await run(token);
    await router.invalidate();
  }

  const describe = (description: string) =>
    change((token) => changeDeployment(slug, { description }, token));
  const expire = (expires_at: string | null) =>
    change((token) => changeDeployment(slug, { expires_at }, token));
  const restore = (id: string) =>
    change((token) => restoreVersion(slug, id, token));
  const describeVersionOf = (id: string, description: string) =>
    change((token) => describeVersion(slug, id, description, token));
  const removeVersion = (id: string) =>
    change((token) => deleteVersion(slug, id, token));
  const prune = () => change((token) => pruneVersions(slug, token));

  async function toggle(enabled: boolean) {
    const token = loadToken();
    if (!token) return;
    setSwitching(true);
    setSwitchError("");
    try {
      await changeDeployment(slug, { enabled }, token);
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
    await deleteDeployment(slug, token);
    // The publish page would otherwise still show the deleted site as live
    if (loadSession()?.deployment.slug === slug) clearSession();
    await navigate({ to: "/sites" });
  }

  const url = siteUrl(site.slug);
  const live = online(site);
  const details = [
    {
      label: "Files",
      value: site.file_count.toLocaleString(),
    },
    { label: "Size", value: formatBytes(site.total_size) },
    {
      label: "Storage",
      value: `${formatBytes(site.storage_size)} · ${site.version_count} ${site.version_count === 1 ? "version" : "versions"}`,
    },
    { label: "Published", value: formatDate(site.created_at) },
    {
      label: "Expires",
      value: site.expires_at ? formatDate(site.expires_at) : "Never",
    },
    {
      label: "Status",
      value: !site.enabled ? "Offline" : expired(site) ? "Expired" : "Online",
    },
  ];

  return (
    <>
      <Link
        to="/sites"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Your sites
      </Link>
      <h1 className="mt-6 font-mono text-2xl font-semibold tracking-tight break-all sm:text-3xl">
        {site.slug}
      </h1>
      <div className="mt-2">
        <SiteDescription description={site.description} onSave={describe} />
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <SiteAddress slug={site.slug} live={live} />
          {url && live && <SitePreview url={url} />}
          <section className="space-y-3 pt-6">
            <h2 className="text-sm font-medium">Update</h2>
            {busy ? (
              <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">
                Wait for the current upload to finish.
              </p>
            ) : (
              <FolderDrop
                prompt="Drop a new version to update it"
                dragging={dragging}
                limits={limits}
                error={message}
                checks={checks}
                onFiles={update}
                onError={showError}
                onDismiss={clearFiles}
              />
            )}
          </section>
          {loaded && loaded.versions.length > 0 && (
            <section className="space-y-3 pt-6">
              <h2 className="text-sm font-medium">Versions</h2>
              <VersionList
                versions={loaded.versions}
                busy={busy}
                onRestore={restore}
                onDescribe={describeVersionOf}
                onDelete={removeVersion}
                onPrune={prune}
              />
            </section>
          )}
        </div>

        <aside className="space-y-4 text-sm">
          <section className="rounded-xl border">
            <h2 className="border-b px-4 py-3 font-medium">Details</h2>
            <dl className="divide-y">
              {details.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 px-4 py-2.5"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-2 rounded-xl border px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-medium">Online</h2>
              <Switch
                checked={site.enabled}
                disabled={switching}
                onCheckedChange={toggle}
                aria-label="Online"
                // Kumo's is blue
                className="aria-checked:bg-kumo-brand aria-checked:ring-kumo-brand dark:aria-checked:bg-kumo-brand dark:aria-checked:ring-kumo-brand dark:aria-checked:*:bg-white"
              />
            </div>
            <p className="text-muted-foreground">
              {site.enabled
                ? "Visitors can reach it. Turning it off takes up to a minute."
                : "Visitors see “Site not found”. Its files and address are kept."}
            </p>
            {switchError && (
              <p role="alert" className="text-destructive">
                {switchError}
              </p>
            )}
          </section>
          <ExpirySection key={slug} site={site} onSave={expire} />
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
}
