import { useEffect, useRef, useState } from "react";

// The site renders at a desktop size, then scales down to fit the frame
const width = 1280;
const height = 800;

export function SitePreview({ url }: { url: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry!.contentRect.width / width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      tabIndex={-1}
      aria-hidden
      className="block overflow-hidden rounded-xl border bg-background text-left [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-2 rounded-full bg-muted-foreground/25"
          />
        ))}
        <span className="ml-2 truncate text-xs text-muted-foreground">
          {new URL(url).host}
        </span>
      </div>
      <div ref={frame} className="relative aspect-[16/9] bg-muted/40">
        {/* A page outline until the site loads, then it fades as the site fades in */}
        <div
          className={`absolute inset-0 flex flex-col gap-[6%] overflow-hidden p-[5%] transition-opacity duration-500 ${loaded ? "opacity-0" : ""}`}
        >
          <div className="flex items-center justify-between">
            <span className="h-2 w-12 rounded-full bg-muted-foreground/15" />
            <span className="flex gap-2">
              {[0, 1, 2].map((link) => (
                <span
                  key={link}
                  className="h-2 w-8 rounded-full bg-muted-foreground/15"
                />
              ))}
            </span>
          </div>
          <div className="space-y-2">
            <span className="block h-4 w-1/2 rounded-md bg-muted-foreground/15" />
            <span className="block h-2 w-2/3 rounded-full bg-muted-foreground/10" />
            <span className="block h-2 w-2/5 rounded-full bg-muted-foreground/10" />
          </div>
          <div className="grid flex-1 grid-cols-3 gap-3">
            {[0, 1, 2].map((card) => (
              <span key={card} className="rounded-lg bg-muted-foreground/10" />
            ))}
          </div>
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-background/60 to-transparent motion-safe:animate-shimmer" />
        </div>
        {/* Sites keep their own origin, which differs from the dashboard's, so
            module scripts load; popups, forms and navigation stay blocked */}
        <iframe
          src={url}
          title="Site preview"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          referrerPolicy="no-referrer"
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          className={`pointer-events-none absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ width, height, transform: `scale(${scale})` }}
        />
      </div>
    </a>
  );
}
