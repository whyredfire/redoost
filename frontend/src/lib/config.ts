export const repository = "https://github.com/whyredfire/redoost";

export const version: string = import.meta.env.VITE_VERSION || "dev";

// Releases link to their notes, and builds between them to their commit
export function versionUrl(version: string) {
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return `${repository}/releases/tag/v${version}`;
  }
  const commit = /^\d+\.\d+\.\d+-([0-9a-f]{7,40})$/.exec(version)?.[1];
  return commit ? `${repository}/commit/${commit}` : null;
}

export type Contributor = {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
};

// Most commits first, as GitHub orders them, leaving out bots like Renovate
export async function readContributors() {
  const name = new URL(repository).pathname;
  const response = await fetch(
    `https://api.github.com/repos${name}/contributors`,
  );
  if (!response.ok) throw new Error("Contributors couldn't be loaded.");
  const contributors: Contributor[] = await response.json();
  return contributors.filter((contributor) => contributor.type === "User");
}

export const installUrl = `${repository}/tree/main/cli#readme`;

type Config = { sitesOrigin: string | null };

// Loaded at runtime so the same build works on any domain
async function loadConfig(): Promise<Config> {
  try {
    const response = await fetch("/config.json");
    if (response.ok) {
      const config: Config = await response.json();
      return config;
    }
  } catch {
    // Sites are shown by slug instead of as links
  }
  return { sitesOrigin: null };
}

export const config = await loadConfig();
