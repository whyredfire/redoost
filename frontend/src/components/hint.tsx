import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Hint = (props: {
  label: string;
  open?: boolean;
  children: JSX.Element;
}) => {
  const [hovered, setHovered] = createSignal(false);

  return (
    <Tooltip
      open={hovered() || (props.open ?? false)}
      onOpenChange={(open: boolean) => setHovered(open)}
    >
      <TooltipTrigger as="span" class="inline-flex">
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
};
