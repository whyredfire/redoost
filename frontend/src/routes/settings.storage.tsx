import { formatBytes } from "@redoost/shared";
import type { Deployment } from "@redoost/shared";
import { Link, createFileRoute, useRouter } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { ConfirmButton } from "@/components/confirm-button";
import { SettingsSection } from "@/components/settings-section";
import { StorageUsage } from "@/components/storage-usage";
import { api } from "@/lib/api";
import { loadSignedIn, loadToken } from "@/lib/session";

const SiteUsage = (props: {
  site: Deployment;
  used: number;
  onPrune: () => Promise<void>;
}) => {
  const share = () =>
    props.used ? (props.site.storage_size / props.used) * 100 : 0;

  const older = () => props.site.version_count - 1;

  return (
    <li class="space-y-1.5 px-4 py-3">
      <div class="flex items-baseline justify-between gap-4">
        <Link
          to="/sites/$slug"
          params={{ slug: props.site.slug }}
          class="truncate font-mono hover:underline"
        >
          {props.site.slug}
        </Link>
        <span class="text-muted-foreground shrink-0 font-mono">
          {formatBytes(props.site.storage_size)}
        </span>
      </div>
      <div class="bg-muted h-1 overflow-hidden rounded-full">
        <div
          class="bg-brand h-full rounded-full"
          style={{ width: `${Math.max(share(), 1)}%` }}
        />
      </div>
      <p class="text-muted-foreground truncate text-xs">
        {props.site.version_count}{" "}
        {props.site.version_count === 1 ? "version" : "versions"}
        <Show when={older() > 0}>
          {" · "}
          <ConfirmButton
            question={`Delete ${props.site.slug}'s older versions?`}
            warning={`${older() === 1 ? "Its older version is" : `Its ${older()} older versions are`} removed, keeping the one visitors see. This can't be undone.`}
            action="Delete older versions"
            onConfirm={props.onPrune}
            as="button"
            type="button"
            class="hover:text-foreground underline underline-offset-2"
          >
            Delete older versions
          </ConfirmButton>
        </Show>
        {props.site.description && ` · ${props.site.description}`}
      </p>
    </li>
  );
};

const StorageSettings = () => {
  const loaded = Route.useLoaderData();
  const router = useRouter();

  const prune = async (slug: string) => {
    const token = loadToken();

    if (!token) {
      throw new Error("Sign in again to delete versions.");
    }

    await api(token).pruneVersions(slug);
    await router.invalidate();
  };

  return (
    <Show when={loaded()}>
      {(data) => {
        const usage = () => data().usage;

        const largest = () =>
          data().sites.toSorted((a, b) => b.storage_size - a.storage_size);

        const elsewhere = () =>
          usage().used -
          data().sites.reduce((sum, site) => sum + site.storage_size, 0);

        const limitRows = () => [
          { label: "Storage per account", value: formatBytes(usage().limit) },
          {
            label: "Largest site",
            value: formatBytes(data().limits.max_deployment_size),
          },
          {
            label: "Largest file",
            value: formatBytes(data().limits.max_file_size),
          },
          {
            label: "Files per site",
            value: data().limits.max_deployment_files.toLocaleString(),
          },
        ];

        return (
          <div class="space-y-10">
            <SettingsSection
              title="Storage"
              description="Every kept version of every site counts in full."
            >
              <div class="bg-card shadow-raised space-y-3 rounded-xl px-4 py-3 text-sm">
                <StorageUsage usage={usage()} />
              </div>
            </SettingsSection>

            <SettingsSection
              title="By site"
              description="Largest first. Deleting a site's older versions frees what they take up."
            >
              <Show
                when={largest().length > 0}
                fallback={
                  <p class="text-muted-foreground rounded-xl border px-4 py-6 text-center text-sm">
                    No sites yet.
                  </p>
                }
              >
                <ul class="bg-card shadow-raised divide-y rounded-xl text-sm">
                  <For each={largest()}>
                    {(site) => (
                      <SiteUsage
                        site={site}
                        used={usage().used}
                        onPrune={() => prune(site.slug)}
                      />
                    )}
                  </For>
                  <Show when={elsewhere() > 0}>
                    <li class="text-muted-foreground flex justify-between gap-4 px-4 py-3">
                      <span>
                        Uploads in progress and versions being deleted
                      </span>
                      <span class="shrink-0 font-mono">
                        {formatBytes(elsewhere())}
                      </span>
                    </li>
                  </Show>
                </ul>
              </Show>
            </SettingsSection>

            <SettingsSection
              title="Limits"
              description="What this server allows. Larger sites and files are turned away before uploading."
            >
              <dl class="bg-card shadow-raised divide-y rounded-xl text-sm">
                <For each={limitRows()}>
                  {(row) => (
                    <div class="flex justify-between gap-4 px-4 py-3">
                      <dt class="text-muted-foreground">{row.label}</dt>
                      <dd class="font-mono">{row.value}</dd>
                    </div>
                  )}
                </For>
              </dl>
            </SettingsSection>
          </div>
        );
      }}
    </Show>
  );
};

export const Route = createFileRoute("/settings/storage")({
  loader: () =>
    loadSignedIn(async (token) => {
      const [usage, sites, limits] = await Promise.all([
        api(token).readUsage(),
        api(token).listDeployments(),
        api().readLimits(),
      ]);

      return { usage, sites, limits };
    }),
  head: () => ({ meta: [{ title: "Storage · redoost" }] }),
  component: StorageSettings,
  errorComponent: () => (
    <p role="alert" class="text-destructive text-sm">
      Storage use couldn't be loaded. Try again in a moment.
    </p>
  ),
});
