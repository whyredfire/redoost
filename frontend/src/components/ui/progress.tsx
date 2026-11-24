import { cn } from "cn"
import * as ProgressPrimitive from "@kobalte/core/progress"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit } from "solid-js"

function Progress(
  props: PolymorphicProps<"div", ProgressPrimitive.ProgressRootProps<"div">>
) {
  const others = omit(props, "class")
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      class={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        props.class
      )}
      {...others}
    >
      <ProgressPrimitive.Fill
        data-slot="progress-indicator"
        class="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (props.value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
