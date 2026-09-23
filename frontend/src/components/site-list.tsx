import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Deployment } from "@/lib/deploy";
import { formatBytes, siteUrl } from "@/lib/format";

export function SiteList({ sites }: { sites: Deployment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your sites</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {sites.map((site) => {
            const url = siteUrl(site.slug);
            return (
              <li
                className="space-y-1 py-3 first:pt-0 last:pb-0"
                key={site.slug}
              >
                {url ? (
                  <a
                    className="block break-all font-medium text-primary underline underline-offset-4"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {url}
                  </a>
                ) : (
                  <p className="font-medium">{site.slug}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {new Date(site.created_at).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}{" "}
                  · {site.file_count} {site.file_count === 1 ? "file" : "files"}{" "}
                  · {formatBytes(site.total_size)}
                </p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
