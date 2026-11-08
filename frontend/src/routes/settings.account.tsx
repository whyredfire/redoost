import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { DangerAction } from "@/components/danger-action";
import { SettingsSection } from "@/components/settings-section";
import { UserAvatar } from "@/components/user-avatar";
import { deleteAccount, providerNames, signedInUser } from "@/lib/auth";
import { useUpload } from "@/lib/upload";

export const Route = createFileRoute("/settings/account")({
  head: () => ({ meta: [{ title: "Account · redoost" }] }),
  component: AccountSettings,
});

function AccountSettings() {
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

  return (
    <div className="space-y-10">
      <SettingsSection title="Account" description="Who you're signed in as.">
        <div className="divide-y rounded-xl border text-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <UserAvatar user={user} className="size-10" />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {user?.name ?? user?.email}
              </p>
              {user?.name && user.email && (
                <p className="truncate text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
          <dl>
            {user && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="shrink-0 text-muted-foreground">
                  Signed in with
                </dt>
                <dd className="min-w-0 truncate">
                  {providerNames[user.provider]}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </SettingsSection>
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
