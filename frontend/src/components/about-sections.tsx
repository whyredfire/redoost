import { Link } from "@tanstack/solid-router";
import { For, Match, Switch, createSignal, onSettled } from "solid-js";

import { ExternalLink } from "@/components/icons";
import { SettingsSection } from "@/components/settings-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  readContributors,
  repository,
  version,
  versionUrl,
} from "@/lib/config";
import type { Contributor } from "@/lib/config";

const link = "underline underline-offset-4 hover:text-foreground";

const ContributorList = () => {
  const [contributors, setContributors] = createSignal<Contributor[] | null>(
    null
  );

  const [failed, setFailed] = createSignal(false);

  onSettled(() => {
    readContributors()
      .then(setContributors)
      .catch(() => setFailed(true));
  });

  return (
    <Switch>
      <Match when={failed()}>{null}</Match>
      <Match when={!contributors()}>
        <p class="text-muted-foreground">Loading contributors…</p>
      </Match>
      <Match when={contributors()}>
        {(list) => (
          <ul class="bg-card shadow-raised divide-y rounded-xl">
            <For each={list()}>
              {(contributor) => (
                <li class="flex items-center justify-between gap-4 px-4 py-3">
                  <a
                    class="flex min-w-0 items-center gap-3 hover:underline"
                    href={contributor.html_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Avatar class="size-8">
                      <AvatarImage
                        src={`${contributor.avatar_url}&s=64`}
                        alt=""
                      />
                      <AvatarFallback class="text-xs">
                        {contributor.login.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span class="truncate font-mono">{contributor.login}</span>
                  </a>
                  <span class="text-muted-foreground shrink-0">
                    {contributor.contributions}{" "}
                    {contributor.contributions === 1 ? "commit" : "commits"}
                  </span>
                </li>
              )}
            </For>
          </ul>
        )}
      </Match>
    </Switch>
  );
};

export const AboutSections = () => {
  const versionLink = versionUrl(version);

  return (
    <div class="space-y-10 text-sm">
      <SettingsSection
        title="redoost"
        description="Publishes static sites: drop a folder, get an address."
      >
        <p class="text-muted-foreground">
          A self-hosted, open source alternative to Vercel Drop. Drop a built
          site, a zip, or an HTML file and get a shareable address, then update
          it, roll it back, or let it expire, from here or the CLI.
        </p>
        <dl class="bg-card shadow-raised divide-y rounded-xl">
          <div class="flex justify-between gap-4 px-4 py-3">
            <dt class="text-muted-foreground">Version</dt>
            <dd class="font-mono">
              {versionLink ? (
                <a
                  class={link}
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
          <div class="flex justify-between gap-4 px-4 py-3">
            <dt class="text-muted-foreground">Source</dt>
            <dd>
              <a
                class={`${link} inline-flex items-center gap-1.5`}
                href={repository}
                target="_blank"
                rel="noreferrer"
              >
                Open source on GitHub
                <ExternalLink class="size-3.5" />
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
        <p class="text-muted-foreground">
          Everyone who has contributed is on{" "}
          <a
            class={link}
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
        <p class="text-muted-foreground">
          Read the{" "}
          <Link to="/privacy" class={link}>
            Privacy Policy
          </Link>{" "}
          and the{" "}
          <Link to="/terms" class={link}>
            Terms of Service
          </Link>
          .
        </p>
      </SettingsSection>
    </div>
  );
};
