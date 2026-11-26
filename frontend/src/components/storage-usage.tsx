import { formatBytes } from "@redoost/shared";
import type { Usage } from "@redoost/shared";

import { Progress } from "@/components/ui/progress";

const indicatorColor = (percentage: number) => {
  if (percentage >= 95) {
    return "[&_[data-slot=progress-indicator]]:bg-destructive";
  }

  if (percentage >= 80) {
    return "[&_[data-slot=progress-indicator]]:bg-amber-500";
  }

  return "";
};

export const StorageUsage = (props: { usage: Usage }) => {
  const percentage = () =>
    Math.min((props.usage.used / props.usage.limit) * 100, 100);

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
        value={props.usage.used > 0 ? Math.max(percentage(), 2) : 0}
        class={indicatorColor(percentage())}
        aria-label="Storage used"
      />
      <p class="text-muted-foreground">
        Sites you publish, and uploads in progress, count toward this.
      </p>
    </>
  );
};
