import { Progress } from "@/components/ui/progress";
import type { Usage } from "@/lib/deploy";
import { formatBytes } from "@/lib/format";

export function StorageUsage({ usage }: { usage: Usage }) {
  const percentage = Math.min((usage.used / usage.limit) * 100, 100);
  const color =
    percentage >= 95
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : percentage >= 80
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "";

  return (
    <>
      <div className="flex justify-between gap-4 font-mono">
        <span>
          {formatBytes(usage.used)}{" "}
          <span className="text-muted-foreground">
            of {formatBytes(usage.limit)} used
          </span>
        </span>
        <span className="text-muted-foreground">
          {Number(percentage.toFixed(1))}%
        </span>
      </div>
      <Progress
        // A sliver stays visible, so a little use doesn't look like none
        value={usage.used > 0 ? Math.max(percentage, 2) : 0}
        className={color}
        aria-label="Storage used"
      />
      <p className="text-muted-foreground">
        Sites you publish, and uploads in progress, count toward this.
      </p>
    </>
  );
}
