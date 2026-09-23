import { config } from "./config";

export function siteUrl(slug: string) {
  if (!config.sitesOrigin) return null;
  const url = new URL(config.sitesOrigin);
  url.hostname = `${slug}.${url.hostname}`;
  return url.origin;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
