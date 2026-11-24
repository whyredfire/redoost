import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// On a wrapper, so disabled buttons still show why
export function Hint(props: {
  label: string;
  // Keeps it up after a click, e.g. to say something was copied
  open?: boolean;
  children: JSX.Element;
}) {
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
}
