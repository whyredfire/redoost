import { Navigate, createFileRoute } from "@tanstack/react-router";
import { FolderDrop } from "@/components/folder-drop";
import { RotatingWord } from "@/components/rotating-word";
import { usePageDrop, useUpload } from "@/lib/upload";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const {
    files,
    session,
    stage,
    message,
    target,
    checks,
    selectFiles,
    showError,
    clearFiles,
    startOver,
  } = useUpload();
  const dragging = usePageDrop(true);

  // Listed files are reviewed and published on their own page
  if (files.length > 0) return <Navigate to="/publish" />;

  return (
    <>
      <div className="pb-8 text-center">
        <h1
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          aria-label="A home for your static site"
        >
          <span aria-hidden>
            A home for your{" "}
            {/* Phones would wrap only the longer words, so the height would jump;
                on its own line, the word is centered */}
            <br className="sm:hidden" />
            <RotatingWord
              className="text-center sm:text-left"
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
      {/* The drop area fills what's left of the first screen */}
      <div className="flex min-h-[max(26rem,calc(100svh-21rem))] flex-col gap-5">
        {session && stage !== "ready" && (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
            Select the same files to resume{" "}
            <span className="font-medium">{session.deployment.slug}</span>, or{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={startOver}
            >
              start over
            </button>
            .
          </p>
        )}
        {target && !session && (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
            Select the new version of{" "}
            <span className="font-medium">{target}</span> to update it, or{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={startOver}
            >
              publish a new site
            </button>{" "}
            instead.
          </p>
        )}
        <FolderDrop
          dragging={dragging}
          error={message}
          checks={checks}
          onFiles={selectFiles}
          onError={showError}
          onDismiss={clearFiles}
        />
      </div>
    </>
  );
}
