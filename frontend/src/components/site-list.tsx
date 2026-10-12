import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { LiveDot } from "@/components/live-dot";
import { Card } from "@/components/ui/card";
import type { Deployment } from "@/lib/deploy";
import { formatBytes, formatDate, siteUrl } from "@/lib/format";

export function SiteList({ sites }: { sites: Deployment[] }) {
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {sites.map((site) => {
          const url = siteUrl(site.slug);
          const domain = url ? new URL(url).host.slice(site.slug.length) : "";
          return (
            <li key={site.slug}>
              <Link
                to="/sites/$slug"
                params={{ slug: site.slug }}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
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
                  <p className="mt-1 pl-4.5 font-mono text-xs text-muted-foreground">
                    {site.file_count} {site.file_count === 1 ? "file" : "files"}{" "}
                    · {formatBytes(site.total_size)} ·{" "}
                    <span className="whitespace-nowrap">
                      {formatDate(site.created_at)}
                    </span>
                    {!site.enabled && " · offline"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
