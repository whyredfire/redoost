import type { ComponentProps } from "@solidjs/web";
import * as ProgressPrimitive from "@ui-sdk/solid/progress";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const Progress = (
  props: ComponentProps<typeof ProgressPrimitive.Progress> & { class?: string }
) => {
  const others = omit(props, "class");

  return (
    <ProgressPrimitive.Progress
      class={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        props.class
      )}
      {...others}
    >
      <ProgressPrimitive.ProgressTrack class="h-full">
        <ProgressPrimitive.ProgressIndicator class="bg-primary h-full transition-all" />
      </ProgressPrimitive.ProgressTrack>
    </ProgressPrimitive.Progress>
  );
};

export { Progress };
