import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SwitchPrimitive from "@kobalte/core/switch";
import { cn } from "cn";
import { omit } from "solid-js";

const Switch = (
  props: PolymorphicProps<"div", SwitchPrimitive.SwitchRootProps<"div">> & {
    size?: "sm" | "default";
    "aria-label"?: string;
  }
) => {
  const others = omit(props, "class", "size", "aria-label");

  return (
    <SwitchPrimitive.Root class="peer inline-flex" {...others}>
      <SwitchPrimitive.Input class="peer" aria-label={props["aria-label"]} />
      <SwitchPrimitive.Control
        data-slot="switch"
        data-size={props.size ?? "default"}
        class={cn(
          "group/switch peer-focus-visible:border-ring peer-focus-visible:ring-ring/50 data-[checked]:bg-primary not-data-[checked]:bg-input dark:not-data-[checked]:bg-input/80 inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none peer-focus-visible:ring-[3px] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
          props.class
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          class="bg-background dark:data-[checked]:bg-primary-foreground dark:not-data-[checked]:bg-foreground pointer-events-none block rounded-full ring-0 transition-transform not-data-[checked]:translate-x-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[checked]:translate-x-[calc(100%-2px)]"
        />
      </SwitchPrimitive.Control>
    </SwitchPrimitive.Root>
  );
};

export { Switch };
