import { cn } from "cn";
import { Check, Upload } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { pickedFiles, type SiteCheck, type SiteFile } from "@/lib/site-files";

type Props = {
  prompt?: ReactNode;
  // Shows the prompt as the page's headline
  heading?: boolean;
  hint?: ReactNode;
  // Replaces choosing files, like signing in first
  actions?: ReactNode;
  footer?: ReactNode;
  // Along the zone's bottom edge, out of the way of dropping
  bottom?: ReactNode;
  className?: string;
  dragging: boolean;
  onFiles: (files: SiteFile[]) => void;
  error: string;
  checks: SiteCheck[];
  onError: (message: string) => void;
  onDismiss: () => void;
};

// Shared with the publish card, so the box keeps its size when files are dropped
export const stageSize =
  "min-h-[max(38rem,calc(100svh-8.5rem))] lg:min-h-[max(36rem,calc(100svh-14rem))]";

const layer = {
  shown: { opacity: 1, filter: "blur(0px)" },
  hidden: { opacity: 0, filter: "blur(8px)" },
};

// Drops are handled page-wide by usePageDrop; this is the visible target
export function FolderDrop({
  prompt = "Drop your site anywhere on this page",
  heading = false,
  hint = "A folder, a zip, or an HTML file",
  actions,
  footer,
  bottom,
  className,
  dragging,
  error,
  checks,
  onFiles,
  onError,
  onDismiss,
}: Props) {
  const failed = error !== "" || checks.length > 0;
  const view = dragging ? "drop" : failed ? "error" : "prompt";
  const reduceMotion = useReducedMotion();
  const transition = { duration: reduceMotion ? 0 : 0.3 };
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (!input.files) return;
    try {
      const selected = await pickedFiles(input.files);
      onFiles(selected);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      // Clearing it empties input.files, so only once they've been read
      input.value = "";
    }
  }

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border-2 text-center transition-colors duration-300 motion-safe:animate-in motion-safe:fade-in",
        dragging
          ? "border-solid border-foreground/20 bg-muted"
          : "border-dashed border-border",
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* The prompt, drop hint and error blur into each other in one spot */}
        <div className="grid w-full max-w-2xl grid-cols-[minmax(0,1fr)] place-items-center">
          <AnimatePresence initial={false}>
            <motion.div
              key={view}
              className="col-start-1 row-start-1 flex w-full flex-col items-center"
              variants={layer}
              initial="hidden"
              animate="shown"
              exit="hidden"
              transition={transition}
            >
              {view === "prompt" && (
                <>
                  <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                    <Upload className="size-5 text-muted-foreground" />
                  </div>
                  {heading ? (
                    <h1 className="text-4xl font-semibold tracking-tighter text-balance sm:text-6xl">
                      {prompt}
                    </h1>
                  ) : (
                    <p className="text-lg font-medium text-balance">{prompt}</p>
                  )}
                  <p
                    className={cn(
                      "text-balance text-muted-foreground",
                      heading
                        ? "mt-4 mb-8 max-w-xl sm:text-lg"
                        : "mt-1 mb-6 max-w-md text-sm",
                    )}
                  >
                    {hint}
                  </p>
                  {actions ?? (
                    <div className="flex justify-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => folderInput.current?.click()}
                      >
                        Choose folder
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => filesInput.current?.click()}
                      >
                        Choose files
                      </Button>
                    </div>
                  )}
                  {footer}
                </>
              )}
              {view === "drop" && (
                <p className="text-lg font-medium">Drop to upload</p>
              )}
              {view === "error" && (
                <>
                  <p className="text-lg font-medium">
                    Couldn't use these files
                  </p>
                  <p
                    role="alert"
                    className="mt-1 mb-6 text-sm text-muted-foreground"
                  >
                    {checks.length > 0
                      ? "Fix the unchecked items and try again."
                      : error}
                  </p>
                  {checks.length > 0 && (
                    <ul className="mb-6 w-full space-y-2 text-left text-sm">
                      {checks.map(({ label, passed }) => (
                        <li
                          key={label}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${passed ? "border-transparent bg-muted/60 text-muted-foreground line-through" : "bg-background font-medium"}`}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border ${passed ? "border-transparent bg-muted-foreground text-background" : "border-foreground"}`}
                          >
                            {passed && <Check className="size-3" />}
                          </span>
                          {label}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" variant="outline" onClick={onDismiss}>
                    Try again
                  </Button>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {bottom && !dragging && <div className="px-6 pb-5">{bottom}</div>}
      <input
        ref={folderInput}
        type="file"
        multiple
        webkitdirectory=""
        className="sr-only"
        aria-label="Choose a site folder"
        onChange={pick}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        className="sr-only"
        aria-label="Choose site files"
        onChange={pick}
      />
    </div>
  );
}
