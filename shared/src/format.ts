/** Sizes as the dashboard shows them, like 3.4 MiB. */
export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KiB`;
  }

  if (bytes < 1024 ** 3) {
    return `${Number((bytes / 1024 ** 2).toFixed(1))} MiB`;
  }

  return `${Number((bytes / 1024 ** 3).toFixed(1))} GiB`;
};

/** A site's address under the server's sites origin, or null without one. */
export const siteUrl = (sitesOrigin: string | null, slug: string) => {
  if (!sitesOrigin) {
    return null;
  }

  const url = new URL(sitesOrigin);
  url.hostname = `${slug}.${url.hostname}`;

  return url.origin;
};

export const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
