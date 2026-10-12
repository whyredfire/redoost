import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";

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
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Hint label={copied ? "Copied" : hint} open={copied}>
      <Button
        type="button"
        variant="ghost"
        size={size}
        aria-label={copied ? "Copied" : label}
        onClick={copy}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </Hint>
  );
}
