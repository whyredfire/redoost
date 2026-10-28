import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { LiveDot } from "@/components/live-dot";
import { Card } from "@/components/ui/card";
import type { Deployment } from "@/lib/deploy";
import { formatBytes, formatDate, siteUrl } from "@/lib/format";

type SiteListProps = {
  sites: Deployment[];
  // While choosing sites, rows toggle these instead of opening the site
  selected?: Set<string>;
  onToggle?: (slug: string) => void;
};

export function SiteList({ sites, selected, onToggle }: SiteListProps) {
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {sites.map((site) => (
          <li key={site.slug}>
            {selected ? (
              <label className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 has-checked:bg-muted/60">
                <input
                  type="checkbox"
                  checked={selected.has(site.slug)}
                  onChange={() => onToggle?.(site.slug)}
                  aria-label={`Select ${site.slug}`}
                  className="size-4 shrink-0 cursor-pointer accent-primary"
                />
                <SiteSummary site={site} />
              </label>
            ) : (
              <Link
                to="/sites/$slug"
                params={{ slug: site.slug }}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <SiteSummary site={site} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SiteSummary({ site }: { site: Deployment }) {
  const url = siteUrl(site.slug);
  const domain = url ? new URL(url).host.slice(site.slug.length) : "";
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2.5 font-mono text-sm">
        <LiveDot off={!site.enabled} />
        <span className="truncate">
          <span className="font-medium">{site.slug}</span>
          <span className="hidden text-muted-foreground sm:inline">
            {domain}
          </span>
        </span>
      </p>
      {site.description && (
        <p className="mt-1 truncate pl-4.5 text-sm text-muted-foreground">
          {site.description}
        </p>
      )}
      <p className="mt-1 pl-4.5 font-mono text-xs text-muted-foreground">
        {site.file_count} {site.file_count === 1 ? "file" : "files"} ·{" "}
        {formatBytes(site.total_size)} ·{" "}
        <span className="whitespace-nowrap">{formatDate(site.created_at)}</span>
        {!site.enabled && " · offline"}
      </p>
    </div>
  );
}
