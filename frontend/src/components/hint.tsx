import { type ReactNode, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// On a wrapper, so disabled buttons still show why
export function Hint({
  label,
  open = false,
  children,
}: {
  label: string;
  // Keeps the hint up, since clicking closes it, e.g. to say something was copied
  open?: boolean;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip open={hovered || open} onOpenChange={setHovered}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
