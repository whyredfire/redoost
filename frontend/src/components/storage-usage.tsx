import { Progress } from "@/components/ui/progress";
import type { Usage } from "@/lib/deploy";
import { formatBytes } from "@/lib/format";

export function StorageUsage(props: { usage: Usage }) {
  const percentage = () =>
    Math.min((props.usage.used / props.usage.limit) * 100, 100);
  const color = () =>
    percentage() >= 95
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : percentage() >= 80
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "";

  return (
    <>
      <div class="flex justify-between gap-4 font-mono">
        <span>
          {formatBytes(props.usage.used)}{" "}
          <span class="text-muted-foreground">
            of {formatBytes(props.usage.limit)} used
          </span>
        </span>
        <span class="text-muted-foreground">
          {Number(percentage().toFixed(1))}%
        </span>
      </div>
      <Progress
        // A sliver stays visible, so a little use doesn't look like none
        value={props.usage.used > 0 ? Math.max(percentage(), 2) : 0}
        class={color()}
        aria-label="Storage used"
      />
      <p class="text-muted-foreground">
        Sites you publish, and uploads in progress, count toward this.
      </p>
    </>
  );
}
