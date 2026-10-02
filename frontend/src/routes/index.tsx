import { Navigate, createFileRoute } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { FolderDrop } from "@/components/folder-drop";
import { ProviderLogo } from "@/components/provider-logo";
import { RotatingWord } from "@/components/rotating-word";
import { Button } from "@/components/ui/button";
import { authConfig, providerNames, signIn } from "@/lib/auth";
import { useToken } from "@/lib/session";
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
  const token = useToken();
  // Accounts can't publish until they sign in
  const signedOut = authConfig.oidc !== null && !token;
  const dragging = usePageDrop(!signedOut);

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
          Drop a built site and get a shareable address.{" "}
          {authConfig.oidc
            ? "No build step required."
            : "No account or build step required."}
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
        {signedOut && authConfig.oidc ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 px-6 py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <LogIn className="size-5 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">Sign in to publish</p>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Your sites stay online for as long as you keep them.
            </p>
            <Button onClick={signIn}>
              <ProviderLogo provider={authConfig.oidc.provider} />
              Sign in with {providerNames[authConfig.oidc.provider]}
            </Button>
          </div>
        ) : (
          <FolderDrop
            dragging={dragging}
            error={message}
            checks={checks}
            onFiles={selectFiles}
            onError={showError}
            onDismiss={clearFiles}
          />
        )}
      </div>
    </>
  );
}
