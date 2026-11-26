import { Navigate, createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";

import { AddressPreview } from "@/components/address-preview";
import { FolderDrop } from "@/components/folder-drop";
import { HeroSnippets } from "@/components/hero-snippets";
import {
  Benefits,
  Faq,
  Features,
  HowItWorks,
} from "@/components/landing-sections";
import { SignInButton } from "@/components/sign-in-prompt";
import { TerminalSection } from "@/components/terminal-section";
import { cn } from "@/lib/cn";
import { inset } from "@/lib/layout";
import { useToken } from "@/lib/session";
import { usePageDrop, useUpload } from "@/lib/upload";

const LandingPage = () => {
  const upload = useUpload();
  const token = useToken();
  const signedOut = () => !token();
  const dragging = usePageDrop(() => !signedOut());

  return (
    <Show
      when={upload.files.length === 0}
      fallback={<Navigate to="/publish" />}
    >
      <div class="flex flex-1 flex-col">
        <Show when={upload.session && upload.stage !== "ready"}>
          <p class={cn(inset, "bg-muted/60 border-b py-3 text-sm")}>
            Select the same files to resume{" "}
            <span class="font-mono">{upload.session?.deployment.slug}</span>, or{" "}
            <button
              type="button"
              class="underline underline-offset-4"
              onClick={() => upload.startOver()}
            >
              start over
            </button>
            .
          </p>
        </Show>
        <Show when={upload.target && !upload.session}>
          <p class={cn(inset, "bg-muted/60 border-b py-3 text-sm")}>
            Select the new version of{" "}
            <span class="font-mono">{upload.target}</span> to update it, or{" "}
            <button
              type="button"
              class="underline underline-offset-4"
              onClick={() => upload.startOver()}
            >
              publish a new site
            </button>{" "}
            instead.
          </p>
        </Show>
        <div
          class={cn(
            "flex min-h-[calc(100svh-3.5rem)] flex-col",
            signedOut() && "pb-14"
          )}
        >
          <div class="relative isolate flex flex-1 flex-col">
            <div
              aria-hidden="true"
              class="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_45%,color-mix(in_oklch,var(--brand)_9%,transparent),transparent)]"
            />
            <Show when={signedOut()}>
              <HeroSnippets />
            </Show>
            <FolderDrop
              class="flex-1 rounded-none bg-transparent shadow-none"
              heading
              prompt={
                <>
                  Drop a folder.
                  <br />
                  <span class="text-muted-foreground">Get an address.</span>
                </>
              }
              hint="Publish a built site, a zip, or a single HTML file. No build step, no config, and it stays online until you delete it."
              actions={signedOut() ? <SignInButton /> : undefined}
              footer={<AddressPreview class="mt-8 w-full max-w-lg" />}
              dragging={dragging()}
              limits={upload.limits}
              error={upload.message}
              checks={upload.checks}
              onFiles={upload.selectFiles}
              onError={upload.showError}
              onDismiss={upload.clearFiles}
            />
          </div>
          <Show when={signedOut()}>
            <Benefits />
          </Show>
        </div>
        <Show when={signedOut()}>
          <HowItWorks />
          <Features />
        </Show>
        <TerminalSection />
        <Show when={signedOut()}>
          <Faq limits={upload.limits} />
        </Show>
      </div>
    </Show>
  );
};

export const Route = createFileRoute("/")({
  component: LandingPage,
});
