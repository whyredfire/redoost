import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  readContributors,
  repository,
  version,
  versionUrl,
  type Contributor,
} from "@/lib/config";

const link = "underline underline-offset-4 hover:text-foreground";

// Loaded from GitHub on each visit; if that fails, the link below still leads there
function ContributorList() {
  const [contributors, setContributors] = useState<Contributor[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readContributors().then(setContributors, () => setFailed(true));
  }, []);

  if (failed) return null;
  if (!contributors) {
    return <p className="text-muted-foreground">Loading contributors…</p>;
  }
  return (
    <ul className="divide-y rounded-xl border">
      {contributors.map(({ login, avatar_url, html_url, contributions }) => (
        <li
          key={login}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <a
            className="flex min-w-0 items-center gap-3 hover:underline"
            href={html_url}
            target="_blank"
            rel="noreferrer"
          >
            <Avatar className="size-8">
              <AvatarImage src={`${avatar_url}&s=64`} alt="" />
              <AvatarFallback className="text-xs">
                {login[0]!.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-mono">{login}</span>
          </a>
          <span className="shrink-0 text-muted-foreground">
            {contributions} {contributions === 1 ? "commit" : "commits"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// What the app is, who made it, and its terms; on its own page and in settings
export function AboutSections() {
  const versionLink = versionUrl(version);

  return (
    <div className="space-y-10 text-sm">
      <SettingsSection
        title="redoost"
        description="Publishes static sites: drop a folder, get an address."
      >
        <p className="text-muted-foreground">
          A self-hosted, open source alternative to Vercel Drop. Drop a built
          site, a zip, or an HTML file and get a shareable address, then update
          it, roll it back, or let it expire, from here or the CLI.
        </p>
        <dl className="divide-y rounded-xl border">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">
              {versionLink ? (
                <a
                  className={link}
                  href={versionLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  {version}
                </a>
              ) : (
                version
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">Source</dt>
            <dd>
              <a
                className={`${link} inline-flex items-center gap-1.5`}
                href={repository}
                target="_blank"
                rel="noreferrer"
              >
                Open source on GitHub
                <ExternalLink className="size-3.5" />
              </a>
            </dd>
          </div>
        </dl>
      </SettingsSection>

      <SettingsSection
        title="Contributors"
        description="The people who built it."
      >
        <ContributorList />
        <p className="text-muted-foreground">
          Everyone who has contributed is on{" "}
          <a
            className={link}
            href={`${repository}/graphs/contributors`}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </SettingsSection>

      <SettingsSection
        title="Legal"
        description="How your data and sites are handled."
      >
        <p className="text-muted-foreground">
          Read the{" "}
          <Link to="/privacy" className={link}>
            Privacy Policy
          </Link>{" "}
          and the{" "}
          <Link to="/terms" className={link}>
            Terms of Service
          </Link>
          .
        </p>
      </SettingsSection>
    </div>
  );
}
