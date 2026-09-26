import { formatBytes } from "@/lib/format";

// Smaller savings, like a site of mostly images, aren't worth mentioning
export function savedPercent(original: number, uploaded: number) {
  const percent = original ? Math.round((1 - uploaded / original) * 100) : 0;
  return percent >= 10 ? percent : null;
}

type SizesProps = { original: number; compressed: number | null };

// Shows "old → new" once compressed, and only the size otherwise
export function Sizes({ original, compressed }: SizesProps) {
  if (compressed === null || compressed >= original) {
    return formatBytes(original);
  }
  return (
    <>
      <s className="opacity-60">{formatBytes(original)}</s> →{" "}
      <span className="text-foreground">{formatBytes(compressed)}</span>
    </>
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
