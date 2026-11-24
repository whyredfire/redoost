import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/solid-router";
import { Show } from "solid-js";
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
  const upload = useUpload();
  const user = signedInUser();

  async function remove() {
    await deleteAccount();
    upload.startOver();
    await navigate({ to: "/" });
    await router.invalidate();
  }

  return (
    <div class="space-y-10">
      <SettingsSection title="Account" description="Who you're signed in as.">
        <div class="divide-y rounded-xl bg-card shadow-raised text-sm">
          <div class="flex items-center gap-3 px-4 py-3">
            <UserAvatar user={user} class="size-10" />
            <div class="min-w-0">
              <p class="truncate font-medium">{user?.name ?? user?.email}</p>
              <Show when={user?.name && user.email}>
                <p class="truncate text-muted-foreground">{user?.email}</p>
              </Show>
            </div>
          </div>
          <dl>
            <Show when={user}>
              {(user) => (
                <div class="flex justify-between gap-4 px-4 py-3">
                  <dt class="shrink-0 text-muted-foreground">Signed in with</dt>
                  <dd class="min-w-0 truncate">
                    {providerNames[user().provider]}
                  </dd>
                </div>
              )}
            </Show>
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
