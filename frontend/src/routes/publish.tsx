import { Navigate, createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { LiveSiteCard } from "@/components/live-site-card";
import { PublishCard } from "@/components/publish-card";
import { useUpload } from "@/lib/upload";

export const Route = createFileRoute("/publish")({
  head: () => ({ meta: [{ title: "Publish · redoost" }] }),
  component: PublishPage,
});

function PublishPage() {
  const upload = useUpload();

  // Dropped files don't survive a reload, so without them there's nothing here
  return (
    <Show
      when={upload.files.length > 0 || upload.live}
      fallback={<Navigate to="/" />}
    >
      <Show when={upload.live} fallback={<PublishCard />}>
        <LiveSiteCard />
      </Show>
    </Show>
  );
}
