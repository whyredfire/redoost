import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SiteList } from "@/components/site-list";
import { Button } from "@/components/ui/button";
import { authConfig } from "@/lib/auth";
import { ApiError, deleteDeployment, listDeployments } from "@/lib/deploy";
import {
  clearSession,
  clearToken,
  loadSession,
  loadToken,
  useToken,
} from "@/lib/session";
import { useUpload } from "@/lib/upload";

export const Route = createFileRoute("/sites")({
  loader: loadSites,
  component: SitesPage,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Your sites couldn't be loaded. Try again in a moment.
    </p>
  ),
});

async function loadSites() {
  const token = loadToken();
  if (!token) return [];
  try {
    const deployments = await listDeployments(token);
    return deployments;
  } catch (error) {
    // The token is unknown to the API, so the next publish starts a new one
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return [];
    }
    throw error;
  }
}

function SitesPage() {
  const sites = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { busy, startUpdate } = useUpload();
  const token = useToken();

  function updateSite(slug: string) {
    startUpdate(slug);
    navigate({ to: "/" });
  }

  async function deleteSite(slug: string) {
    const token = loadToken();
    if (!token) return;
    await deleteDeployment(slug, token);
    // The publish page would otherwise still show the deleted site as live
    if (loadSession()?.deployment.slug === slug) clearSession();
    await router.invalidate();
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>
        <p className="mt-1 text-muted-foreground">
          {authConfig.oidc
            ? "Sites published from your account."
            : "Sites published from this browser, or from the token you imported."}
        </p>
      </div>
      {authConfig.oidc && !token ? (
        <SignInPrompt
          title="Sign in to see your sites"
          description="Sites you publish while signed in are listed here."
        />
      ) : sites.length > 0 ? (
        <SiteList
          sites={sites}
          canUpdate={!busy}
          onUpdate={updateSite}
          onDelete={deleteSite}
        />
      ) : (
        <div className="rounded-xl border px-6 py-14 text-center">
          <Globe className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 font-medium">No sites yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {authConfig.oidc
              ? "Publish your first site."
              : "Publish your first site, or import a token from another device."}
          </p>
          <Button className="mt-6" asChild>
            <Link to="/">Publish a site</Link>
          </Button>
        </div>
      )}
    </>
  );
}
