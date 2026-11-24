import { Show } from "solid-js";
import { CopyButton } from "@/components/copy-button";
import { Hint } from "@/components/hint";
import { ExternalLink } from "@/components/icons";
import { LiveDot } from "@/components/live-dot";
import { buttonVariants } from "@/components/ui/button";
import { siteUrl } from "@/lib/format";

type SiteAddressProps = { slug: string; live?: boolean };

export function SiteAddress(props: SiteAddressProps) {
  const url = () => siteUrl(props.slug);
  const live = () => props.live ?? true;

  return (
    <div class="flex items-center gap-3 rounded-xl bg-card shadow-raised py-1 pr-1 pl-4 text-left">
      <LiveDot pulse={live()} off={!live()} />
      <span class="min-w-0 flex-1 truncate py-1.5 font-mono text-sm">
        {url() ?? props.slug}
      </span>
      <Show when={url()}>
        {(url) => (
          <>
            <CopyButton text={url()} label="Copy address" />
            <Hint label="Open site">
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                aria-label="Open site"
                data-slot="button"
                data-variant="ghost"
                data-size="icon"
                class={buttonVariants({ variant: "ghost", size: "icon" })}
              >
                <ExternalLink />
              </a>
            </Hint>
          </>
        )}
      </Show>
    </div>
  );
}
