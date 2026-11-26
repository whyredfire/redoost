import { errorMessage } from "@redoost/shared";
import type { Limits, SiteCheck, SiteFile } from "@redoost/shared";
import type { JSX } from "@solidjs/web";
import { cn } from "cn";
import { For, Show } from "solid-js";

import { Folder } from "@/components/detent/ui/folder";
import { Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Presence } from "@/lib/motion";
import { pickedFiles } from "@/lib/site-files";

interface Props {
  prompt?: JSX.Element;
  heading?: boolean;
  hint?: JSX.Element;
  actions?: JSX.Element;
  footer?: JSX.Element;
  class?: string;
  dragging: boolean;
  limits: Limits | null;
  onFiles: (files: SiteFile[]) => void;
  error: string;
  checks: SiteCheck[];
  onError: (message: string) => void;
  onDismiss: () => void;
}

export const stageSize =
  "min-h-[max(38rem,calc(100svh-8.5rem))] lg:min-h-[max(36rem,calc(100svh-14rem))]";

const layer = {
  shown: { opacity: 1, filter: "blur(0px)" },
  hidden: { opacity: 0, filter: "blur(8px)" },
};

export const FolderDrop = (props: Props) => {
  const failed = () => props.error !== "" || props.checks.length > 0;
  const view = () => (failed() && !props.dragging ? "error" : "prompt");
  let folderInput!: HTMLInputElement;
  let filesInput!: HTMLInputElement;

  const pick = async (event: Event & { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;

    if (!input.files) {
      return;
    }

    try {
      const selected = await pickedFiles(input.files, props.limits);
      props.onFiles(selected);
    } catch (error) {
      props.onError(errorMessage(error));
    } finally {
      // WARNING: clearing the input empties input.files, so only clear it once they've been read
      input.value = "";
    }
  };

  return (
    <div
      class={cn(
        "rounded-card bg-card ease-detent motion-safe:animate-in motion-safe:fade-in relative isolate flex flex-col text-center transition-shadow duration-300",
        props.dragging
          ? "shadow-[0_0_0_2px_color-mix(in_oklch,var(--ink)_14%,transparent),var(--elev-float)]"
          : "shadow-raised",
        props.class
      )}
    >
      <div aria-hidden="true" class="dot-grid absolute inset-0 -z-10" />
      <div class="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div class="grid w-full max-w-2xl grid-cols-[minmax(0,1fr)] place-items-center">
          <Presence
            when={view()}
            initial={layer.hidden}
            animate={layer.shown}
            exit={layer.hidden}
            transition={{ duration: 0.3 }}
          >
            {(shown) => (
              <div class="col-start-1 row-start-1 flex w-full flex-col items-center">
                {shown === "prompt" && (
                  <>
                    <div class="mb-6 [zoom:0.75]">
                      <Folder open={props.dragging} />
                    </div>
                    {props.heading ? (
                      <h1 class="text-4xl font-semibold tracking-tighter text-balance sm:text-6xl">
                        {props.prompt ?? "Drop your site anywhere on this page"}
                      </h1>
                    ) : (
                      <p class="text-lg font-medium text-balance">
                        {props.prompt ?? "Drop your site anywhere on this page"}
                      </p>
                    )}
                    <p
                      class={cn(
                        "text-muted-foreground text-balance",
                        props.heading
                          ? "mt-4 mb-8 max-w-xl sm:text-lg"
                          : "mt-1 mb-6 max-w-md text-sm"
                      )}
                    >
                      {props.hint ?? "A folder, a zip, or an HTML file"}
                    </p>
                    {props.actions ?? (
                      <div class="flex justify-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => folderInput.click()}
                        >
                          Choose folder
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => filesInput.click()}
                        >
                          Choose files
                        </Button>
                      </div>
                    )}
                    {props.footer}
                  </>
                )}
                {shown === "error" && (
                  <>
                    <p class="text-lg font-medium">Couldn't use these files</p>
                    <p
                      role="alert"
                      class="text-muted-foreground mt-1 mb-6 text-sm"
                    >
                      {props.checks.length > 0
                        ? "Fix the unchecked items and try again."
                        : props.error}
                    </p>
                    <Show when={props.checks.length > 0}>
                      <ul class="mb-6 w-full space-y-2 text-left text-sm">
                        <For each={props.checks}>
                          {(check) => (
                            <li
                              class={`flex items-center gap-3 rounded-xl px-4 py-3 ${check.passed ? "bg-muted/60 text-muted-foreground line-through" : "bg-card shadow-raised font-medium"}`}
                            >
                              <span
                                class={`flex size-4 shrink-0 items-center justify-center rounded border ${check.passed ? "bg-muted-foreground text-background border-transparent" : "border-foreground"}`}
                              >
                                {check.passed && <Check class="size-3" />}
                              </span>
                              {check.label}
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => props.onDismiss()}
                    >
                      Try again
                    </Button>
                  </>
                )}
              </div>
            )}
          </Presence>
        </div>
      </div>
      <input
        ref={folderInput}
        type="file"
        multiple
        webkitdirectory
        class="sr-only"
        aria-label="Choose a site folder"
        onChange={pick}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        class="sr-only"
        aria-label="Choose site files"
        onChange={pick}
      />
    </div>
  );
};
