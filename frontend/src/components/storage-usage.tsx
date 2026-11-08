import { Meter } from "@cloudflare/kumo/components/meter";
import type { Usage } from "@/lib/deploy";
import { formatBytes } from "@/lib/format";

export function StorageUsage({ usage }: { usage: Usage }) {
  const percentage = Math.min((usage.used / usage.limit) * 100, 100);
  const color =
    percentage >= 95
      ? "from-kumo-danger via-kumo-danger to-kumo-danger"
      : percentage >= 80
        ? "from-kumo-warning via-kumo-warning to-kumo-warning"
        : "";

  return (
    <>
      <Meter
        // A sliver stays visible, so a little use doesn't look like none
        value={usage.used > 0 ? Math.max(percentage, 2) : 0}
        label={`${formatBytes(usage.used)} of ${formatBytes(usage.limit)} used`}
        customValue={`${Number(percentage.toFixed(1))}%`}
        indicatorClassName={color}
      />
      <p className="text-muted-foreground">
        Sites you publish, and uploads in progress, count toward this.
      </p>
    </>
  );
}
