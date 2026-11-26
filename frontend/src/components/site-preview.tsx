import { cn } from "cn";
import { createMemo, createSignal, onSettled } from "solid-js";

const width = 1280;
const height = 800;

interface SitePreviewProps {
  url: string;
  fill?: boolean;
}

export const SitePreview = (props: SitePreviewProps) => {
  let frame!: HTMLDivElement;
  const [box, setBox] = createSignal({ width: 0, height: 0 });
  const [shown, setShown] = createSignal(false);

  onSettled(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(frame);

    return () => observer.disconnect();
  });

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
        "bg-card shadow-raised block overflow-hidden rounded-xl text-left",
        props.fill && "flex flex-1 flex-col"
      )}
    >
      <div class="flex items-center gap-1.5 border-b px-3 py-2">
        {[0, 1, 2].map(() => (
          <span class="bg-muted-foreground/25 size-2 rounded-full" />
        ))}
        <span class="text-muted-foreground ml-2 truncate font-mono text-xs">
          {new URL(props.url).host}
        </span>
      </div>
      <div
        ref={frame}
        class={cn(
          "bg-muted/40 relative",
          props.fill ? "min-h-40 flex-1 sm:min-h-64" : "aspect-[16/9]"
        )}
      >
        <div
          class={`absolute inset-0 flex flex-col gap-[6%] overflow-hidden p-[5%] transition-opacity duration-500 ${shown() ? "opacity-0" : ""}`}
        >
          <div class="flex items-center justify-between">
            <span class="bg-muted-foreground/15 h-2 w-12 rounded-full" />
            <span class="flex gap-2">
              {[0, 1, 2].map(() => (
                <span class="bg-muted-foreground/15 h-2 w-8 rounded-full" />
              ))}
            </span>
          </div>
          <div class="space-y-2">
            <span class="bg-muted-foreground/15 block h-4 w-1/2 rounded-md" />
            <span class="bg-muted-foreground/10 block h-2 w-2/3 rounded-full" />
            <span class="bg-muted-foreground/10 block h-2 w-2/5 rounded-full" />
          </div>
          <div class="grid flex-1 grid-cols-3 gap-3">
            {[0, 1, 2].map(() => (
              <span class="bg-muted-foreground/10 rounded-lg" />
            ))}
          </div>
          <span class="via-background/60 motion-safe:animate-shimmer absolute inset-0 bg-linear-to-r from-transparent to-transparent" />
        </div>
        <iframe
          src={props.url}
          title="Site preview"
          // WARNING: allow-same-origin is only safe while sites are served from an origin other than the dashboard's
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
};
