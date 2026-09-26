import { Navigate, createFileRoute } from "@tanstack/react-router";
import { PublishCard } from "@/components/publish-card";
import { useUpload } from "@/lib/upload";

export const Route = createFileRoute("/publish")({
  component: PublishPage,
});

function PublishPage() {
  const { files, live } = useUpload();

  // Dropped files don't survive a reload, so without them there's nothing here
  if (files.length === 0 && !live) return <Navigate to="/" />;

  return <PublishCard />;
}
