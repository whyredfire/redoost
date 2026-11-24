import { Show } from "solid-js";
import { Info } from "@/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatBytes } from "@/lib/format";
import { Presence } from "@/lib/motion";

// Smaller savings, like a site of mostly images, aren't worth mentioning
function savedPercent(original: number, uploaded: number) {
  const percent = original ? Math.round((1 - uploaded / original) * 100) : 0;
  return percent >= 10 ? percent : null;
}

type SizesProps = { original: number; compressed: number | null };

const swap = {
  initial: { opacity: 0, filter: "blur(4px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(4px)" },
};

export function Sizes(props: SizesProps) {
  const smaller = () =>
    props.compressed !== null && props.compressed < props.original
      ? props.compressed
      : null;

  return (
    <Presence
      when={smaller() === null ? "original" : "compressed"}
      mode="wait"
      {...swap}
      transition={{ duration: 0.2 }}
    >
      {(key) => (
        <span class="inline-block">
          {key === "original" ? (
            formatBytes(props.original)
          ) : (
            <>
              <s class="opacity-60">{formatBytes(props.original)}</s> →{" "}
              <span class="text-foreground">
                {formatBytes(smaller() ?? props.original)}
              </span>
            </>
          )}
        </span>
      )}
    </Presence>
  );
}

// Says which size is shown, since a site's size is easy to mistake for an update's
export function SizeInfo(props: { update: boolean }) {
  return (
    <Popover placement="bottom-start">
      <PopoverTrigger
        class="rounded-full transition-colors hover:text-foreground"
        aria-label="What this size means"
      >
        <Info class="size-4" />
      </PopoverTrigger>
      <PopoverContent class="text-sm">
        {props.update
          ? "What this update uploads: only new and changed files. Text files like HTML, CSS, and JavaScript are gzipped in your browser first."
          : "The size of the whole site. Text files like HTML, CSS, and JavaScript are gzipped in your browser before uploading, so less is stored."}
      </PopoverContent>
    </Popover>
  );
}

type CompressionSavingProps = { original: number; uploaded: number };

export function CompressionSaving(props: CompressionSavingProps) {
  const percent = () => savedPercent(props.original, props.uploaded);

  return (
    <Show when={percent() !== null}>
      <p class="text-sm text-muted-foreground">
        <span class="font-medium text-foreground">{percent()}%</span> smaller ·{" "}
        {formatBytes(props.original)} uploaded as {formatBytes(props.uploaded)}
      </p>
    </Show>
  );
}
