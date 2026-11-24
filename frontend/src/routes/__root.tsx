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
import { cn } from "cn";
import { AccountMenu } from "@/components/account-menu";
import { AgentPromptButton } from "@/components/agent-prompt-button";
import { PageHeading } from "@/components/page-heading";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { signOut, signedInUser } from "@/lib/auth";
import { frame, inset } from "@/lib/layout";
import { useToken } from "@/lib/session";
import { useUpload } from "@/lib/upload";

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "redoost" }] }),
  component: Layout,
  notFoundComponent: NotFound,
});

const navClass =
  "text-sm transition-colors hover:text-foreground data-[status=active]:text-foreground";

const footerLink =
  "whitespace-nowrap underline-offset-4 hover:text-foreground hover:underline";

// Pages meant for reading stay narrow; the rest line up with the header
function contentWidth(pathname: string) {
  // The front page's sections run between the rules
  if (pathname === "/") return "flex max-w-none flex-col p-0 sm:p-0 lg:p-0";
  if (
    pathname === "/publish" ||
    pathname.startsWith("/sites") ||
    pathname.startsWith("/settings")
  ) {
    return "max-w-none";
  }
  return "max-w-3xl";
}

// Signed in, About is a tab in settings instead
function footerLinks(signedIn: boolean) {
  return [
    ...(signedIn ? [] : [{ to: "/about", label: "About" } as const]),
    { to: "/privacy", label: "Privacy Policy" } as const,
    { to: "/terms", label: "Terms of Service" } as const,
  ];
}

function Layout() {
  const upload = useUpload();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const token = useToken();
  // Only the front page is ruled down both sides; elsewhere cards give the structure
  const column = () =>
    cn(frame, "sm:border-x", pathname() !== "/" && "sm:border-x-transparent");

  // The header's links to / start a fresh publish, unless an upload is running
  function startFresh() {
    if (!upload.busy) upload.startOver();
  }

  async function leave() {
    upload.startOver();
    signOut();
    await navigate({ to: "/" });
    await router.invalidate();
  }

  return (
    <div class="flex min-h-screen flex-col">
      <HeadContent />
      <header class="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div
          class={cn(column(), inset, "flex h-14 items-center gap-4 sm:gap-6")}
        >
          <Link
            to="/"
            class="flex items-center gap-2 font-semibold"
            onClick={startFresh}
          >
            <span class="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
              r<span class="text-brand">.</span>
            </span>
            {/* Phones show only the mark, so the header fits */}
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

      <div class={cn(column(), "flex flex-1 flex-col")}>
        <main
          class={cn(
            inset,
            "mx-auto w-full flex-1 py-10 sm:py-12",
            contentWidth(pathname()),
          )}
        >
          <Outlet />
        </main>
      </div>

      <footer class="border-t">
        <div
          class={cn(
            column(),
            inset,
            "flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between",
          )}
        >
          {/* Phones wrap between links rather than inside them, without the dots */}
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
}

function NotFound() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <>
      <PageHeading title="Page not found">
        There's nothing at this address.
      </PageHeading>
      <p class="truncate rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm">
        <span class="text-brand">404</span> {pathname()}
      </p>
      <Link to="/" class={buttonVariants({ className: "mt-6" })}>
        Publish a site
      </Link>
    </>
  );
}
