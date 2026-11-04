import {
  HeadContent,
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Fragment } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AgentPromptButton } from "@/components/agent-prompt-button";
import { PageHeading } from "@/components/page-heading";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOut, signedInUser } from "@/lib/auth";
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

// Pages meant for reading stay narrow; the rest use the width
function contentWidth(pathname: string) {
  if (["/", "/publish"].includes(pathname) || pathname.startsWith("/sites")) {
    return "max-w-6xl";
  }
  // Room for the section list beside each section
  if (pathname.startsWith("/settings")) return "max-w-5xl";
  return "max-w-3xl";
}

// Signed in, About is a tab in settings instead
function footerLinks(signedIn: boolean) {
  return [
    ...(signedIn
      ? []
      : [
          <Link to="/about" className={footerLink}>
            About
          </Link>,
        ]),
    <Link to="/privacy" className={footerLink}>
      Privacy Policy
    </Link>,
    <Link to="/terms" className={footerLink}>
      Terms of Service
    </Link>,
  ];
}

function Layout() {
  const { busy, startOver } = useUpload();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const token = useToken();

  // The header's links to / start a fresh publish, unless an upload is running
  function startFresh() {
    if (!busy) startOver();
  }

  async function leave() {
    startOver();
    signOut();
    await navigate({ to: "/" });
    await router.invalidate();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <HeadContent />
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5 sm:gap-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold"
            onClick={startFresh}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
              r<span className="text-brand">.</span>
            </span>
            {/* Phones show only the mark, so the header fits */}
            <span className="sr-only sm:not-sr-only">redoost</span>
          </Link>
          <nav className="flex gap-5">
            <Link
              to="/"
              className={`${navClass} ${pathname === "/publish" ? "text-foreground" : "text-muted-foreground"}`}
              activeOptions={{ exact: true }}
              onClick={startFresh}
            >
              Publish
            </Link>
            <Link to="/sites" className={`${navClass} text-muted-foreground`}>
              Sites
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <AgentPromptButton />
            <ThemeToggle />
            {token && <AccountMenu user={signedInUser()} onSignOut={leave} />}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full flex-1 px-5 py-10 sm:py-12 ${contentWidth(pathname)}`}
      >
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          {/* Phones wrap between links rather than inside them, without the dots */}
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 sm:gap-x-0">
            {footerLinks(Boolean(token)).map((link, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <span aria-hidden className="hidden px-1.5 sm:inline">
                    ·
                  </span>
                )}
                {link}
              </Fragment>
            ))}
          </nav>
          <p className="whitespace-nowrap">
            Made by{" "}
            <a
              className={footerLink}
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
      <p className="truncate rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm">
        <span className="text-brand">404</span> {pathname}
      </p>
      <Button className="mt-6" asChild>
        <Link to="/">Publish a site</Link>
      </Button>
    </>
  );
}
