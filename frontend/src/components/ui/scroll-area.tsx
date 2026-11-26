import type { ComponentProps } from "@solidjs/web";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const ScrollArea = (props: ComponentProps<"div">) => {
  const others = omit(props, "class", "children");

  return (
    <div
      data-slot="scroll-area"
      class={cn("relative", props.class)}
      {...others}
    >
      <div
        data-slot="scroll-area-viewport"
        class="focus-visible:ring-ring/50 size-full overflow-auto rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {props.children}
      </div>
    </div>
  );
};

export { ScrollArea };
