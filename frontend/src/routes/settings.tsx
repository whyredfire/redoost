import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { KeyRound, UserRound } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { useToken } from "@/lib/session";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

const sections = [
  { to: "/settings/account", label: "Account", icon: UserRound },
  { to: "/settings/tokens", label: "API tokens", icon: KeyRound },
] as const;

function SettingsLayout() {
  const token = useToken();

  if (!token) {
    return (
      <>
        <PageHeading title="Settings" />
        <SignInPrompt
          title="Sign in to see your settings"
          description="Your account, storage, and API tokens are here."
        />
      </>
    );
  }

  return (
    <>
      <PageHeading title="Settings" />
      <div className="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
        {/* A row of tabs on phones, a column beside the section otherwise */}
        <nav className="-mx-1 flex gap-1 overflow-x-auto md:mx-0 md:flex-col">
          {sections.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}
