import { errorMessage } from "@redoost/shared";
import type { Deployment } from "@redoost/shared";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";

interface SiteSelectionProps {
  shownCount: number;
  selected: Deployment[];
  onSelectAll: (all: boolean) => void;
  onCancel: () => void;
  onSwitch: (enabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

const sites = (count: number) => `${count} ${count === 1 ? "site" : "sites"}`;

export const SiteSelection = (props: SiteSelectionProps) => {
  let checkbox: HTMLInputElement | undefined;
  const [switching, setSwitching] = createSignal(false);
  const [switchError, setSwitchError] = createSignal("");

  const all = createMemo(
    () => props.shownCount > 0 && props.selected.length === props.shownCount
  );

  const one = () => props.selected.length === 1;

  createEffect(
    () => props.selected.length > 0 && !all(),
    (indeterminate) => {
      if (checkbox) {
        checkbox.indeterminate = indeterminate;
      }
    }
  );

  const switchTo = async (enabled: boolean) => {
    setSwitching(true);
    setSwitchError("");

    try {
      await props.onSwitch(enabled);
    } catch (error) {
      setSwitchError(errorMessage(error));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div class="bg-background sticky top-[calc(3.5rem+1px)] z-5 -mt-2 mb-2 py-2">
      <div class="bg-card shadow-raised flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2 text-sm">
        <input
          type="checkbox"
          checked={all()}
          ref={(input) => (checkbox = input)}
          onChange={() => props.onSelectAll(!all())}
          aria-label="Select all shown sites"
          class="accent-primary size-4 shrink-0 cursor-pointer"
        />
        <span class="text-muted-foreground flex-1">
          {props.selected.length > 0
            ? `${sites(props.selected.length)} selected`
            : "Select sites"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => props.onCancel()}
        >
          Cancel
        </Button>
        <div class="flex gap-2 max-sm:basis-full max-sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              switching() || !props.selected.some((site) => site.enabled)
            }
            onClick={() => switchTo(false)}
          >
            Take offline
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              switching() || !props.selected.some((site) => !site.enabled)
            }
            onClick={() => switchTo(true)}
          >
            Put online
          </Button>
          <ConfirmButton
            question={`Delete ${sites(props.selected.length)}?`}
            warning={`${one() ? "It" : "They"} will stop working and ${one() ? "its" : "their"} files will be removed. This can't be undone.`}
            action={`Delete ${sites(props.selected.length)}`}
            pending="Deleting…"
            onConfirm={() => props.onDelete()}
            variant="destructive"
            size="sm"
            disabled={props.selected.length === 0}
            details={
              <ul class="bg-muted/30 max-h-40 overflow-y-auto rounded-lg border px-3 py-2 font-mono text-xs">
                <For each={props.selected}>
                  {({ slug }) => <li class="truncate py-0.5">{slug}</li>}
                </For>
              </ul>
            }
          >
            Delete
          </ConfirmButton>
        </div>
      </div>
      <Show when={switchError()}>
        <p role="alert" class="text-destructive mt-2 px-1 text-sm">
          {switchError()}
        </p>
      </Show>
    </div>
  );
};
