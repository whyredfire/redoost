import {
  HeadContent,
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { AccountMenu } from "@/components/account-menu";
import { AgentPromptButton } from "@/components/agent-prompt-button";
import { PageHeading } from "@/components/page-heading";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { signOut, signedInUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { frame, inset } from "@/lib/layout";
import { useToken } from "@/lib/session";
import { useUpload } from "@/lib/upload";

const navClass =
  "text-sm transition-colors hover:text-foreground data-[status=active]:text-foreground";

const footerLink =
  "whitespace-nowrap underline-offset-4 hover:text-foreground hover:underline";

const contentWidth = (pathname: string) => {
  if (pathname === "/") {
    return "flex max-w-none flex-col p-0 sm:p-0 lg:p-0";
  }

  if (
    pathname === "/publish" ||
    pathname.startsWith("/sites") ||
    pathname.startsWith("/settings")
  ) {
    return "max-w-none";
  }

  return "max-w-3xl";
};

const footerLinks = (signedIn: boolean) => [
  ...(signedIn ? [] : [{ to: "/about", label: "About" } as const]),
  { to: "/privacy", label: "Privacy Policy" } as const,
  { to: "/terms", label: "Terms of Service" } as const,
];

const Layout = () => {
  const upload = useUpload();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const token = useToken();

  const startFresh = () => {
    if (!upload.busy) {
      upload.startOver();
    }
  };

  const leave = async () => {
    upload.startOver();
    signOut();
    await navigate({ to: "/" });
    await router.invalidate();
  };

  return (
    <div class="flex min-h-screen flex-col">
      <HeadContent />
      <header class="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div class={cn(frame, inset, "flex h-14 items-center gap-4 sm:gap-6")}>
          <Link
            to="/"
            class="flex items-center gap-2 font-semibold"
            onClick={startFresh}
          >
            <span class="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-xs">
              r<span class="text-brand">.</span>
            </span>
            <span class="sr-only sm:not-sr-only">redoost</span>
          </Link>
          <nav class="flex gap-5">
            <Link
              to="/"
              class={`${navClass} ${pathname() === "/publish" ? "text-foreground" : "text-muted-foreground"}`}
              activeOptions={{ exact: true }}
              onClick={startFresh}
            >
              Publish
            </Link>
            <Link to="/sites" class={`${navClass} text-muted-foreground`}>
              Sites
            </Link>
          </nav>
          <div class="ml-auto flex items-center gap-1">
            <AgentPromptButton />
            <ThemeToggle />
            <Show when={token()}>
              <AccountMenu user={signedInUser()} onSignOut={leave} />
            </Show>
          </div>
        </div>
      </header>

      <div class={cn(frame, "flex flex-1 flex-col")}>
        <main
          class={cn(
            inset,
            "mx-auto w-full flex-1 py-10 sm:py-12",
            contentWidth(pathname())
          )}
        >
          <Outlet />
        </main>
      </div>

      <footer class="border-t">
        <div
          class={cn(
            frame,
            inset,
            "text-muted-foreground flex flex-col items-center gap-3 py-6 text-sm sm:flex-row sm:justify-between"
          )}
        >
          <nav class="flex flex-wrap justify-center gap-x-4 gap-y-1 sm:gap-x-0">
            <For each={footerLinks(Boolean(token()))}>
              {(link, index) => (
                <>
                  <Show when={index() > 0}>
                    <span aria-hidden="true" class="hidden px-1.5 sm:inline">
                      ·
                    </span>
                  </Show>
                  <Link to={link.to} class={footerLink}>
                    {link.label}
                  </Link>
                </>
              )}
            </For>
          </nav>
          <p class="whitespace-nowrap">
            Made by{" "}
            <a
              class={footerLink}
              href="https://github.com/whyredfire"
              target="_blank"
              rel="noreferrer"
            >
              Karan Parashar
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

const NotFound = () => {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <>
      <PageHeading title="Page not found">
        There's nothing at this address.
      </PageHeading>
      <p class="bg-muted/40 truncate rounded-xl border px-4 py-3 font-mono text-sm">
        <span class="text-brand">404</span> {pathname()}
      </p>
      <Link to="/" class={buttonVariants({ className: "mt-6" })}>
        Publish a site
      </Link>
    </>
  );
};

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "redoost" }] }),
  component: Layout,
  notFoundComponent: NotFound,
});
