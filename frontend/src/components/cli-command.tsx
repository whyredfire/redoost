import { CopyButton } from "@/components/copy-button";
import { repository } from "@/lib/config";

type CliCommandProps = { command?: string; compact?: boolean };

export function CliCommand({
  command = "redoost publish ./dist",
  compact = false,
}: CliCommandProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/40 py-1.5 pr-1.5 pl-4 font-mono text-sm">
      <span className="min-w-0 flex-1 truncate">
        <span className="text-brand select-none">$ </span>
        {command}
      </span>
      {!compact && (
        <a
          href={`${repository}/tree/main/cli#readme`}
          target="_blank"
          rel="noreferrer"
          className="hidden shrink-0 font-sans text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline"
        >
          Install the CLI
        </a>
      )}
      <CopyButton
        text={command}
        label="Copy the CLI command"
        hint="Copy command"
      />
    </div>
  );
}
