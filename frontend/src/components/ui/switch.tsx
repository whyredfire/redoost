import type { ComponentProps } from "@solidjs/web";
import * as SwitchPrimitive from "@ui-sdk/solid/switch";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const Switch = (
  props: ComponentProps<typeof SwitchPrimitive.Switch> & {
    class?: string;
    size?: "sm" | "default";
  }
) => {
  const others = omit(props, "class", "size");

  return (
    <SwitchPrimitive.Switch
      data-size={props.size ?? "default"}
      class={cn(
        "group/switch focus-visible:border-ring focus-visible:ring-ring/50 data-[checked]:bg-primary not-data-[checked]:bg-input dark:not-data-[checked]:bg-input/80 inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        props.class
      )}
      {...others}
    >
      <SwitchPrimitive.SwitchThumb class="bg-background dark:data-[checked]:bg-primary-foreground dark:not-data-[checked]:bg-foreground pointer-events-none block rounded-full ring-0 transition-transform not-data-[checked]:translate-x-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[checked]:translate-x-[calc(100%-2px)]" />
    </SwitchPrimitive.Switch>
  );
};

export { Switch };
