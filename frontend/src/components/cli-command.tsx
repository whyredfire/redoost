import { CopyButton } from "@/components/copy-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export const CliCommand = (props: { command: string }) => (
  <div class="bg-muted/40 flex items-center gap-3 rounded-xl border py-1.5 pr-1.5 pl-4 font-mono text-sm">
    <span class="min-w-0 flex-1 truncate">
      <span class="text-brand select-none">$ </span>
      {props.command}
    </span>
    <CopyButton
      text={props.command}
      label="Copy the CLI command"
      hint="Copy command"
    />
  </div>
);

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
      <CliCommand command="npm i -g redoost" />
      <CliCommand command="bun add -g redoost" />
      <p class="text-muted-foreground text-xs">Needs Node.js 20 or later.</p>
    </PopoverContent>
  </Popover>
);
