import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/lib/deploy";
import { errorMessage } from "@/lib/format";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";

type SiteSelectionProps = {
  // How many sites are listed right now, which select all picks
  shownCount: number;
  selected: Deployment[];
  onSelectAll: (all: boolean) => void;
  onCancel: () => void;
  onSwitch: (enabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
};

function sites(count: number) {
  return `${count} ${count === 1 ? "site" : "sites"}`;
}

export function SiteSelection({
  shownCount,
  selected,
  onSelectAll,
  onCancel,
  onSwitch,
  onDelete,
}: SiteSelectionProps) {
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const all = shownCount > 0 && selected.length === shownCount;
  const one = selected.length === 1;

  async function switchTo(enabled: boolean) {
    setSwitching(true);
    setSwitchError("");
    try {
      await onSwitch(enabled);
    } catch (cause) {
      setSwitchError(errorMessage(cause));
    } finally {
      setSwitching(false);
    }
  }

  return (
    // Stays under the header, so Delete is in reach however far the list scrolls
    <div className="sticky top-[calc(3.5rem+1px)] z-5 -mt-2 mb-2 bg-background py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2 text-sm">
        <Checkbox
          checked={all}
          indeterminate={selected.length > 0 && !all}
          onCheckedChange={() => onSelectAll(!all)}
          aria-label="Select all shown sites"
        />
        <span className="flex-1 text-muted-foreground">
          {selected.length > 0
            ? `${sites(selected.length)} selected`
            : "Select sites"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2 max-sm:basis-full max-sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={switching || !selected.some((site) => site.enabled)}
            onClick={() => switchTo(false)}
          >
            Take offline
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={switching || !selected.some((site) => !site.enabled)}
            onClick={() => switchTo(true)}
          >
            Put online
          </Button>
          <ConfirmButton
            question={`Delete ${sites(selected.length)}?`}
            warning={`${one ? "It" : "They"} will stop working and ${one ? "its" : "their"} files will be removed. This can't be undone.`}
            action={`Delete ${sites(selected.length)}`}
            pending="Deleting…"
            onConfirm={onDelete}
            details={
              <ul className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs">
                {selected.map(({ slug }) => (
                  <li key={slug} className="truncate py-0.5">
                    {slug}
                  </li>
                ))}
              </ul>
            }
          >
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.length === 0}
            >
              Delete
            </Button>
          </ConfirmButton>
        </div>
      </div>
      {switchError && (
        <p role="alert" className="mt-2 px-1 text-sm text-destructive">
          {switchError}
        </p>
      )}
    </div>
  );
}
