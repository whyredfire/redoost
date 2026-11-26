import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as ProgressPrimitive from "@kobalte/core/progress";
import { cn } from "cn";
import { omit } from "solid-js";

const Progress = (
  props: PolymorphicProps<"div", ProgressPrimitive.ProgressRootProps<"div">>
) => {
  const others = omit(props, "class");

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      class={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        props.class
      )}
      {...others}
    >
      <ProgressPrimitive.Fill
        data-slot="progress-indicator"
        class="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (props.value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
};

export { Progress };
