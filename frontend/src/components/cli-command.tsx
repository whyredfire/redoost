import { Show } from "solid-js";

import { CopyButton } from "@/components/copy-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";

interface CliCommandProps {
  command?: string;
  variant?: "box" | "compact" | "plain";
}

export const CliCommand = (props: CliCommandProps) => {
  const command = () => props.command ?? "redoost publish ./dist";
  const variant = () => props.variant ?? "box";

  return (
    <Show
      when={variant() !== "plain"}
      fallback={
        <p class="text-muted-foreground flex items-center gap-2 font-mono text-xs">
          <span>
            <span class="text-brand select-none">$ </span>
            <span class="text-foreground">{command()}</span>
          </span>
          <CopyButton
            text={command()}
            label="Copy the CLI command"
            hint="Copy command"
            size="icon-xs"
          />
          <InstallCli class="font-sans" />
        </p>
      }
    >
      <div class="bg-muted/40 flex items-center gap-3 rounded-xl border py-1.5 pr-1.5 pl-4 font-mono text-sm">
        <span class="min-w-0 flex-1 truncate">
          <span class="text-brand select-none">$ </span>
          {command()}
        </span>
        <Show when={variant() === "box"}>
          <InstallCli class="text-muted-foreground hidden shrink-0 font-sans sm:inline" />
        </Show>
        <CopyButton
          text={command()}
          label="Copy the CLI command"
          hint="Copy command"
        />
      </div>
    </Show>
  );
};

export const InstallCli = (props: { class?: string }) => (
  <Popover>
    <PopoverTrigger
      class={cn(
        "hover:text-foreground underline-offset-4 hover:underline",
        props.class
      )}
    >
      Install the CLI
    </PopoverTrigger>
    <PopoverContent side="top" class="w-80 space-y-2">
      <CliCommand command="npm i -g redoost" variant="compact" />
      <CliCommand command="bun add -g redoost" variant="compact" />
      <p class="text-muted-foreground text-xs">Needs Node.js 20 or later.</p>
    </PopoverContent>
  </Popover>
);
