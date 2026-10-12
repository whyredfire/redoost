import { Bot, Check } from "lucide-react";
import { useState } from "react";
import { AgentLogos } from "@/components/agent-logos";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// The prompt only points at the setup steps, which agents fetch and follow
export function AgentPromptButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(
      `Fetch and follow the instructions to set me up for redoost from ${location.origin}/agent-setup.md`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Tooltip open={copied}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={
            copied ? "Copied" : "Copy a prompt that sets up your agent"
          }
          onClick={copy}
        >
          {copied ? (
            <Check className="sm:hidden" />
          ) : (
            <Bot className="sm:hidden" />
          )}
          <span className="hidden sm:inline">Set up your agent</span>
          <AgentLogos className="hidden sm:flex" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copied</TooltipContent>
    </Tooltip>
  );
}
