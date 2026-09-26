import { Bot, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Agents read the publishing steps from llms.txt, so the prompt only points there
export function AgentPromptButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(`Fetch ${location.origin}/llms.txt`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground"
      aria-label={copied ? "Copied" : "Copy AI agent prompt to clipboard"}
      onClick={copy}
    >
      {copied ? <Check /> : <Bot />}
      <span className="hidden sm:inline">
        {copied ? "Copied" : "Copy for your agent"}
      </span>
    </Button>
  );
}
