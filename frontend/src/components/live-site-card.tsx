import { Link } from "@tanstack/solid-router";
import { animate } from "motion";
import { onSettled, Show } from "solid-js";

import { CompressionSaving } from "@/components/compression-saving";
import { stageSize } from "@/components/folder-drop";
import { ExternalLink } from "@/components/icons";
import { SiteAddress } from "@/components/site-address";
import { SitePreview } from "@/components/site-preview";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { siteUrl } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import { useUpload } from "@/lib/upload";

const stagger = 0.08;

const rise = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export const LiveSiteCard = () => {
  const upload = useUpload();
  const reduceMotion = useReducedMotion();

  return (
    <Show when={upload.session}>
      {(session) => {
        const slug = () => session().deployment.slug;
        const url = () => siteUrl(slug());
        const risen: HTMLElement[] = [];
        const rises = (el: HTMLElement) => risen.push(el);
        onSettled(() => {
          if (reduceMotion()) {
            return;
          }

          for (const [i, el] of risen.entries()) {
            animate(
              el,
              {
                opacity: [rise.hidden.opacity, rise.shown.opacity],
                y: [rise.hidden.y, rise.shown.y],
                filter: [rise.hidden.filter, rise.shown.filter],
              },
              { duration: 0.4, ease: "easeOut", delay: i * stagger }
            );
          }
        });

        return (
          <Card class={cn(stageSize, "py-0")}>
            <CardContent class="flex flex-1 flex-col gap-6 py-6 lg:px-8 lg:py-8">
              <div ref={rises} class="min-w-0 space-y-3">
                <h1 class="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
                  {upload.target ? "It's updated." : "It's live."}{" "}
                  <span class="text-muted-foreground">
                    {upload.target
                      ? "Same address, new files."
                      : "Share it with anyone."}
                  </span>
                </h1>
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div class="min-w-0 lg:max-w-xl lg:flex-1">
                    <SiteAddress slug={slug()} />
                  </div>
                  <div class="flex flex-wrap items-center gap-3">
                    <Show when={url()}>
                      {(href) => (
                        <a
                          href={href()}
                          target="_blank"
                          rel="noreferrer"
                          data-slot="button"
                          class={buttonVariants()}
                        >
                          <ExternalLink />
                          Open site
                        </a>
                      )}
                    </Show>
                    <Link
                      to="/sites/$slug"
                      params={{ slug: slug() }}
                      data-slot="button"
                      class={buttonVariants({ variant: "outline" })}
                    >
                      Manage site
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => upload.startOver()}
                    >
                      Publish another site
                    </Button>
                  </div>
                </div>
                <Show when={session().deployment.description}>
                  <p class="text-muted-foreground text-sm break-words">
                    {session().deployment.description}
                  </p>
                </Show>
                <Show when={session().originalSize !== undefined}>
                  <CompressionSaving
                    original={session().originalSize ?? 0}
                    uploaded={session().deployment.total_size}
                  />
                </Show>
              </div>
              <Show when={url()}>
                {(href) => (
                  <div ref={rises} class="flex min-h-0 flex-1 flex-col">
                    <SitePreview url={href()} fill />
                  </div>
                )}
              </Show>
            </CardContent>
          </Card>
        );
      }}
    </Show>
  );
};
