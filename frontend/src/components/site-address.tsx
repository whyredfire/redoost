import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Hint } from "@/components/hint";
import { LiveDot } from "@/components/live-dot";
import { Button } from "@/components/ui/button";
import { siteUrl } from "@/lib/format";

type SiteAddressProps = { slug: string; live?: boolean; className?: string };

export function SiteAddress({
  slug,
  live = true,
  className,
}: SiteAddressProps) {
  const url = siteUrl(slug);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card py-1 pr-1 pl-4 text-left shadow-xs",
        className,
      )}
    >
      <LiveDot pulse={live} off={!live} />
      <span className="min-w-0 flex-1 truncate py-1.5 font-mono text-sm">
        {url ?? slug}
      </span>
      {url && (
        <>
          <CopyButton text={url} label="Copy address" />
          <Hint label="Open site">
            <Button variant="ghost" size="icon" asChild>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open site"
              >
                <ExternalLink />
              </a>
            </Button>
          </Hint>
        </>
      )}
    </div>
  );
}
