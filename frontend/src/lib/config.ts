export const repository = "https://github.com/whyredfire/redoost";

export const version: string = import.meta.env.PUBLIC_VERSION || "dev";

export const versionUrl = (release: string) => {
  if (/^\d+\.\d+\.\d+$/u.test(release)) {
    return `${repository}/releases/tag/v${release}`;
  }

  const commit = /^\d+\.\d+\.\d+-\d+-g(?<commit>[0-9a-f]{7,40})/u.exec(release)
    ?.groups?.commit;

  return commit ? `${repository}/commit/${commit}` : null;
};

export interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
}

export const readContributors = async () => {
  const name = new URL(repository).pathname;

  const response = await fetch(
    `https://api.github.com/repos${name}/contributors`
  );

  if (!response.ok) {
    throw new Error("Contributors couldn't be loaded.");
  }

  const contributors: Contributor[] = await response.json();

  return contributors.filter((contributor) => contributor.type === "User");
};

export const installUrl = `${repository}/tree/main/cli#readme`;

interface Config {
  sitesOrigin: string | null;
}

const fallbackConfig: Config = { sitesOrigin: null };

const loadConfig = async () => {
  try {
    const response = await fetch("/config.json");

    if (response.ok) {
      const loaded: Config = await response.json();

      return loaded;
    }
  } catch {
    return fallbackConfig;
  }

  return fallbackConfig;
};

export const config = await loadConfig();
