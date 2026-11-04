import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { DangerAction } from "@/components/danger-action";
import { SettingsSection } from "@/components/settings-section";
import { StorageUsage } from "@/components/storage-usage";
import { deleteAccount, providerNames, signedInUser } from "@/lib/auth";
import { readUsage } from "@/lib/deploy";
import { loadSignedIn } from "@/lib/session";
import { useUpload } from "@/lib/upload";

export const Route = createFileRoute("/settings/account")({
  loader: () => loadSignedIn(readUsage),
  head: () => ({ meta: [{ title: "Account · redoost" }] }),
  component: AccountSettings,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Your account couldn't be loaded. Try again in a moment.
    </p>
  ),
});

function AccountSettings() {
  const usage = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { startOver } = useUpload();
  const user = signedInUser();

  async function remove() {
    await deleteAccount();
    startOver();
    await navigate({ to: "/" });
    await router.invalidate();
  }

  const details = [
    { label: "Name", value: user?.name },
    { label: "Email", value: user?.email },
    { label: "Signed in with", value: user && providerNames[user.provider] },
  ];

  return (
    <div className="space-y-10">
      <SettingsSection title="Account" description="Who you're signed in as.">
        <dl className="divide-y rounded-xl border text-sm">
          {details.map(
            ({ label, value }) =>
              value && (
                <div
                  key={label}
                  className="flex justify-between gap-4 px-4 py-3"
                >
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate">{value}</dd>
                </div>
              ),
          )}
        </dl>
      </SettingsSection>
      {usage && (
        <SettingsSection
          title="Storage"
          description="Every kept version of every site counts in full. Deleting old versions frees it up."
        >
          <div className="space-y-3 rounded-xl border px-4 py-3 text-sm">
            <StorageUsage usage={usage} />
          </div>
        </SettingsSection>
      )}
      <DangerAction
        title="Delete account"
        description="Deletes your account and all your sites."
        question="Delete your account?"
        warning="Your account and all your sites are deleted, and the sites go offline right away. This can't be undone."
        action="Delete account"
        onConfirm={remove}
      />
    </div>
  );
}
