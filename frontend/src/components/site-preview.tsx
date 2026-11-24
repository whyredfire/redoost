import { cn } from "cn";
import { createMemo, createSignal, onSettled } from "solid-js";

// The site renders at a desktop size, then scales down to fit the frame
const width = 1280;
const height = 800;

// With fill, it takes all the height it's given, showing more of the page
type SitePreviewProps = { url: string; fill?: boolean };

export function SitePreview(props: SitePreviewProps) {
  let frame!: HTMLDivElement;
  const [box, setBox] = createSignal({ width: 0, height: 0 });
  const [shown, setShown] = createSignal(false);

  onSettled(() => {
    const observer = new ResizeObserver(([entry]) =>
      setBox({
        width: entry!.contentRect.width,
        height: entry!.contentRect.height,
      }),
    );
    observer.observe(frame);
    return () => observer.disconnect();
  });

  // Slow sites show while they draw in, not after every asset has loaded
  onSettled(() => {
    const timer = setTimeout(() => setShown(true), 1000);
    return () => clearTimeout(timer);
  });

  const scale = createMemo(() => box().width / width);

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noreferrer"
      tabindex={-1}
      aria-hidden="true"
      class={cn(
        "block overflow-hidden rounded-xl bg-card shadow-raised text-left",
        props.fill && "flex flex-1 flex-col",
      )}
    >
      <div class="flex items-center gap-1.5 border-b px-3 py-2">
        {[0, 1, 2].map(() => (
          <span class="size-2 rounded-full bg-muted-foreground/25" />
        ))}
        <span class="ml-2 truncate font-mono text-xs text-muted-foreground">
          {new URL(props.url).host}
        </span>
      </div>
      <div
        ref={frame}
        class={cn(
          "relative bg-muted/40",
          props.fill ? "min-h-40 flex-1 sm:min-h-64" : "aspect-[16/9]",
        )}
      >
        <div
          class={`absolute inset-0 flex flex-col gap-[6%] overflow-hidden p-[5%] transition-opacity duration-500 ${shown() ? "opacity-0" : ""}`}
        >
          <div class="flex items-center justify-between">
            <span class="h-2 w-12 rounded-full bg-muted-foreground/15" />
            <span class="flex gap-2">
              {[0, 1, 2].map(() => (
                <span class="h-2 w-8 rounded-full bg-muted-foreground/15" />
              ))}
            </span>
          </div>
          <div class="space-y-2">
            <span class="block h-4 w-1/2 rounded-md bg-muted-foreground/15" />
            <span class="block h-2 w-2/3 rounded-full bg-muted-foreground/10" />
            <span class="block h-2 w-2/5 rounded-full bg-muted-foreground/10" />
          </div>
          <div class="grid flex-1 grid-cols-3 gap-3">
            {[0, 1, 2].map(() => (
              <span class="rounded-lg bg-muted-foreground/10" />
            ))}
          </div>
          <span class="absolute inset-0 bg-linear-to-r from-transparent via-background/60 to-transparent motion-safe:animate-shimmer" />
        </div>
        {/* Sites keep their own origin, which differs from the dashboard's, so
            module scripts load; popups, forms and navigation stay blocked */}
        <iframe
          src={props.url}
          title="Site preview"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          referrerpolicy="no-referrer"
          tabindex={-1}
          onLoad={() => setShown(true)}
          class={`pointer-events-none absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-500 ${shown() ? "opacity-100" : "opacity-0"}`}
          style={{
            width: `${width}px`,
            height: `${props.fill && scale() ? box().height / scale() : height}px`,
            transform: `scale(${scale()})`,
          }}
        />
      </div>
    </a>
  );
}
