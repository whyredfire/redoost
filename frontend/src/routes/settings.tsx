import { Link, Outlet, createFileRoute } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import {
  HardDrive,
  Info,
  KeyRound,
  Palette,
  UserRound,
} from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { useToken } from "@/lib/session";

const sections = [
  { to: "/settings/account", label: "Account", icon: UserRound },
  { to: "/settings/storage", label: "Storage", icon: HardDrive },
  { to: "/settings/tokens", label: "API tokens", icon: KeyRound },
  { to: "/settings/appearance", label: "Appearance", icon: Palette },
  { to: "/settings/about", label: "About", icon: Info },
] as const;

const SettingsLayout = () => {
  const token = useToken();

  return (
    <Show
      when={token()}
      fallback={
        <>
          <PageHeading title="Settings" />
          <SignInPrompt
            title="Sign in to see your settings"
            description="Your account, storage, API tokens, and appearance are here."
          />
        </>
      }
    >
      <PageHeading title="Settings" />
      <div class="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav class="-mx-1 flex gap-1 overflow-x-auto md:mx-0 md:flex-col">
          <For each={sections}>
            {(section) => (
              <Link
                to={section.to}
                class="text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
              >
                <section.icon class="size-4" />
                {section.label}
              </Link>
            )}
          </For>
        </nav>
        <div class="min-w-0">
          <Outlet />
        </div>
      </div>
    </Show>
  );
};

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});
