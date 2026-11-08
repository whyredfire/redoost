import { type ReactNode, useState } from "react";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";

// On a wrapper, so disabled buttons still show why
export function Hint({
  label,
  open = false,
  children,
}: {
  label: string;
  // Keeps it up after a click, e.g. to say something was copied
  open?: boolean;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip
      content={label}
      open={hovered || open}
      onOpenChange={setHovered}
      render={<span className="inline-flex" />}
    >
      {children}
    </Tooltip>
  );
}
