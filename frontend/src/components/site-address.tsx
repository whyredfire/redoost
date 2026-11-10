import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Hint } from "@/components/hint";
import { LiveDot } from "@/components/live-dot";
import { Button } from "@/components/ui/button";
import { siteUrl } from "@/lib/format";

type SiteAddressProps = { slug: string; live?: boolean };

export function SiteAddress({ slug, live = true }: SiteAddressProps) {
  const url = siteUrl(slug);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card shadow-raised py-1 pr-1 pl-4 text-left">
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
