import { Info } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Popover } from "@cloudflare/kumo/components/popover";
import { formatBytes } from "@/lib/format";

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

export function Sizes({ original, compressed }: SizesProps) {
  const reduceMotion = useReducedMotion();
  const smaller =
    compressed !== null && compressed < original ? compressed : null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={smaller === null ? "original" : "compressed"}
        className="inline-block"
        {...swap}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
      >
        {smaller === null ? (
          formatBytes(original)
        ) : (
          <>
            <s className="opacity-60">{formatBytes(original)}</s> →{" "}
            <span className="text-foreground">{formatBytes(smaller)}</span>
          </>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

// Says which size is shown, since a site's size is easy to mistake for an update's
export function SizeInfo({ update }: { update: boolean }) {
  return (
    <Popover>
      <Popover.Trigger
        className="rounded-full transition-colors hover:text-foreground"
        aria-label="What this size means"
      >
        <Info className="size-4" />
      </Popover.Trigger>
      <Popover.Content className="max-w-72" align="start">
        {update
          ? "What this update uploads: only new and changed files. Text files like HTML, CSS, and JavaScript are gzipped in your browser first."
          : "The size of the whole site. Text files like HTML, CSS, and JavaScript are gzipped in your browser before uploading, so less is stored."}
      </Popover.Content>
    </Popover>
  );
}

type CompressionSavingProps = { original: number; uploaded: number };

export function CompressionSaving({
  original,
  uploaded,
}: CompressionSavingProps) {
  const percent = savedPercent(original, uploaded);
  if (percent === null) return null;

  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{percent}%</span> smaller ·{" "}
      {formatBytes(original)} uploaded as {formatBytes(uploaded)}
    </p>
  );
}
