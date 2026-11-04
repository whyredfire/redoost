import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ConfirmButton } from "@/components/confirm-button";
import { SettingsSection } from "@/components/settings-section";
import { StorageUsage } from "@/components/storage-usage";
import {
  listDeployments,
  pruneVersions,
  readLimits,
  readUsage,
  type Deployment,
} from "@/lib/deploy";
import { formatBytes } from "@/lib/format";
import { loadSignedIn, loadToken } from "@/lib/session";

export const Route = createFileRoute("/settings/storage")({
  loader: () =>
    loadSignedIn(async (token) => {
      const [usage, sites, limits] = await Promise.all([
        readUsage(token),
        listDeployments(token),
        readLimits(),
      ]);
      return { usage, sites, limits };
    }),
  head: () => ({ meta: [{ title: "Storage · redoost" }] }),
  component: StorageSettings,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Storage use couldn't be loaded. Try again in a moment.
    </p>
  ),
});

function SiteUsage({
  site,
  used,
  onPrune,
}: {
  site: Deployment;
  used: number;
  onPrune: () => Promise<void>;
}) {
  const share = used ? (site.storage_size / used) * 100 : 0;
  const older = site.version_count - 1;

  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <Link
          to="/sites/$slug"
          params={{ slug: site.slug }}
          className="truncate font-mono hover:underline"
        >
          {site.slug}
        </Link>
        <span className="shrink-0 font-mono text-muted-foreground">
          {formatBytes(site.storage_size)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.max(share, 1)}%` }}
        />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {site.version_count} {site.version_count === 1 ? "version" : "versions"}
        {older > 0 && (
          <>
            {" · "}
            <ConfirmButton
              question={`Delete ${site.slug}'s older versions?`}
              warning={`${older === 1 ? "Its older version is" : `Its ${older} older versions are`} removed, keeping the one visitors see. This can't be undone.`}
              action="Delete older versions"
              onConfirm={onPrune}
            >
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Delete older versions
              </button>
            </ConfirmButton>
          </>
        )}
        {site.description && ` · ${site.description}`}
      </p>
    </li>
  );
}

function StorageSettings() {
  const loaded = Route.useLoaderData();
  const router = useRouter();
  if (!loaded) return null;
  const { usage, sites, limits } = loaded;

  async function prune(slug: string) {
    const token = loadToken();
    if (!token) throw new Error("Sign in again to delete versions.");
    await pruneVersions(slug, token);
    await router.invalidate();
  }

  const largest = sites.toSorted((a, b) => b.storage_size - a.storage_size);
  // Uploads in progress, and versions waiting out Nginx's cache before deletion
  const elsewhere =
    usage.used - sites.reduce((sum, site) => sum + site.storage_size, 0);
  const limitRows = [
    { label: "Storage per account", value: formatBytes(usage.limit) },
    { label: "Largest site", value: formatBytes(limits.max_deployment_size) },
    { label: "Largest file", value: formatBytes(limits.max_file_size) },
    {
      label: "Files per site",
      value: limits.max_deployment_files.toLocaleString(),
    },
  ];

  return (
    <div className="space-y-10">
      <SettingsSection
        title="Storage"
        description="Every kept version of every site counts in full."
      >
        <div className="space-y-3 rounded-xl border px-4 py-3 text-sm">
          <StorageUsage usage={usage} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="By site"
        description="Largest first. Deleting a site's older versions frees what they take up."
      >
        {largest.length > 0 ? (
          <ul className="divide-y rounded-xl border text-sm">
            {largest.map((site) => (
              <SiteUsage
                key={site.slug}
                site={site}
                used={usage.used}
                onPrune={() => prune(site.slug)}
              />
            ))}
            {elsewhere > 0 && (
              <li className="flex justify-between gap-4 px-4 py-3 text-muted-foreground">
                <span>Uploads in progress and versions being deleted</span>
                <span className="shrink-0 font-mono">
                  {formatBytes(elsewhere)}
                </span>
              </li>
            )}
          </ul>
        ) : (
          <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">
            No sites yet.
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Limits"
        description="What this server allows. Larger sites and files are turned away before uploading."
      >
        <dl className="divide-y rounded-xl border text-sm">
          {limitRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>
    </div>
  );
}
