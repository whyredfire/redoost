import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DangerAction } from "@/components/danger-action";
import { FolderDrop } from "@/components/folder-drop";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteAddress } from "@/components/site-address";
import { SitePreview } from "@/components/site-preview";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  changeDeployment,
  deleteDeployment,
  readDeployment,
  type Deployment,
} from "@/lib/deploy";
import { formatBytes, formatDate, siteUrl } from "@/lib/format";
import {
  clearSession,
  clearToken,
  loadSession,
  loadToken,
} from "@/lib/session";
import type { SiteFile } from "@/lib/site-files";
import { usePageDrop, useUpload } from "@/lib/upload";

export const Route = createFileRoute("/sites_/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} · redoost` }] }),
  loader: ({ params }) => loadSite(params.slug),
  component: SitePage,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      This site couldn't be loaded. Try again in a moment.
    </p>
  ),
});

async function loadSite(slug: string) {
  const token = loadToken();
  if (!token) return null;
  try {
    const site = await readDeployment(slug, token);
    return site;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return null;
    }
    // Other people's sites look the same as missing ones
    if (error instanceof ApiError && [403, 404].includes(error.status)) {
      throw notFound();
    }
    throw error;
  }
}

function SitePage() {
  const site: Deployment | null = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { busy, message, checks, selectUpdate, showError, clearFiles } =
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

  async function toggle(enabled: boolean) {
    const token = loadToken();
    if (!token || !site) return;
    setSwitching(true);
    setSwitchError("");
    try {
      await changeDeployment(site.slug, enabled, token);
      await router.invalidate();
    } catch (cause) {
      setSwitchError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSwitching(false);
    }
  }

  async function remove() {
    const token = loadToken();
    if (!token || !site) return;
    await deleteDeployment(site.slug, token);
    // The publish page would otherwise still show the deleted site as live
    if (loadSession()?.deployment.slug === site.slug) clearSession();
    await navigate({ to: "/sites" });
  }

  const url = siteUrl(site.slug);
  const details = [
    {
      label: "Files",
      value: site.file_count.toLocaleString(),
    },
    { label: "Size", value: formatBytes(site.total_size) },
    { label: "Published", value: formatDate(site.created_at) },
    { label: "Status", value: site.enabled ? "Online" : "Offline" },
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

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <SiteAddress slug={site.slug} live={site.enabled} />
          {url && site.enabled && <SitePreview url={url} />}
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
                error={message}
                checks={checks}
                onFiles={update}
                onError={showError}
                onDismiss={clearFiles}
              />
            )}
          </section>
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
