import { expired, formatBytes, online } from "@redoost/shared";
import type { Deployment } from "@redoost/shared";
import { Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { ChevronRight } from "@/components/icons";
import { LiveDot } from "@/components/live-dot";
import { Card } from "@/components/ui/card";
import { formatDate, siteUrl } from "@/lib/format";

interface SiteListProps {
  sites: Deployment[];
  selected?: Set<string>;
  onToggle?: (slug: string) => void;
}

const SiteSummary = (props: { site: Deployment }) => {
  const domain = () => {
    const url = siteUrl(props.site.slug);

    return url ? new URL(url).host.slice(props.site.slug.length) : "";
  };

  return (
    <div class="min-w-0 flex-1">
      <p class="flex items-center gap-2.5 font-mono text-sm">
        <LiveDot off={!online(props.site)} />
        <span class="truncate">
          <span class="font-medium">{props.site.slug}</span>
          <span class="text-muted-foreground hidden sm:inline">{domain()}</span>
        </span>
      </p>
      <Show when={props.site.description}>
        <p class="text-muted-foreground mt-1 truncate pl-4.5 text-sm">
          {props.site.description}
        </p>
      </Show>
      <p class="text-muted-foreground mt-1 pl-4.5 font-mono text-xs">
        {props.site.file_count} {props.site.file_count === 1 ? "file" : "files"}{" "}
        · {formatBytes(props.site.storage_size)}
        {props.site.version_count > 1 &&
          ` in ${props.site.version_count} versions`}{" "}
        ·{" "}
        <span class="whitespace-nowrap">
          {formatDate(props.site.created_at)}
        </span>
        {!props.site.enabled && " · offline"}
        {props.site.expires_at &&
          (expired(props.site)
            ? " · expired"
            : ` · expires ${formatDate(props.site.expires_at)}`)}
      </p>
    </div>
  );
};

export const SiteList = (props: SiteListProps) => (
  <Card class="py-0">
    <ul class="divide-y">
      <For each={props.sites} keyed={(site) => site.slug}>
        {(site) => (
          <li>
            <Show
              when={props.selected}
              fallback={
                <Link
                  to="/sites/$slug"
                  params={{ slug: site().slug }}
                  class="hover:bg-muted/40 focus-visible:bg-muted/40 flex items-center gap-4 px-5 py-4 transition-colors focus-visible:outline-none"
                >
                  <SiteSummary site={site()} />
                  <ChevronRight class="text-muted-foreground size-4 shrink-0" />
                </Link>
              }
            >
              {(selected) => (
                <label class="hover:bg-muted/40 has-checked:bg-muted/60 flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors">
                  <input
                    type="checkbox"
                    checked={selected().has(site().slug)}
                    onChange={() => props.onToggle?.(site().slug)}
                    aria-label={`Select ${site().slug}`}
                    class="accent-primary size-4 shrink-0 cursor-pointer"
                  />
                  <SiteSummary site={site()} />
                </label>
              )}
            </Show>
          </li>
        )}
      </For>
    </ul>
  </Card>
);
