import { Check, Copy } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/clipboard";

type CopyButtonProps = {
  text: string;
  label: string;
  hint?: string;
  size?: "icon" | "icon-xs";
};

export function CopyButton({
  text,
  label,
  hint = "Copy address",
  size = "icon",
}: CopyButtonProps) {
  const { copied, copy } = useCopy();

  return (
    <Hint label={copied ? "Copied" : hint} open={copied}>
      <Button
        type="button"
        variant="ghost"
        size={size}
        aria-label={copied ? "Copied" : label}
        onClick={() => copy(text)}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </Hint>
  );
}
