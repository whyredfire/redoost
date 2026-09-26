import { createFileRoute } from "@tanstack/react-router";
import { use, useState } from "react";
import { PublishCard } from "@/components/publish-card";
import { RotatingWord } from "@/components/rotating-word";
import { FreshStart } from "@/lib/fresh-start";

export const Route = createFileRoute("/")({
  component: PublishPage,
});

function PublishPage() {
  const [empty, setEmpty] = useState(true);
  const resets = use(FreshStart);

  return (
    // The card fills what's left of the first screen; the hero only shows on
    // the empty drop area, and both animate as it collapses
    <div
      className={
        empty
          ? "[--publish-height:max(26rem,calc(100svh-21rem))]"
          : "[--publish-height:max(26rem,calc(100svh-14rem))]"
      }
    >
      <div
        inert={!empty}
        className={`grid duration-300 motion-safe:transition-[grid-template-rows,opacity] ${empty ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-8 text-center">
            <h1
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
              aria-label="A home for your static site"
            >
              <span aria-hidden>
                A home for your{" "}
                <RotatingWord
                  words={[
                    "static site",
                    "portfolio",
                    "landing page",
                    "docs",
                    "side project",
                  ]}
                />
              </span>
            </h1>
            <p className="mt-3 text-muted-foreground">
              Drop a built site and get a shareable address. No account or build
              step required.
            </p>
          </div>
        </div>
      </div>
      <PublishCard onEmptyChange={setEmpty} resetSignal={resets} />
    </div>
  );
}
