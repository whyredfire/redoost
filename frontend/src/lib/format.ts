import { siteUrl as originUrl } from "@redoost/shared";

import { config } from "./config";

export const siteUrl = (slug: string) => originUrl(config.sitesOrigin, slug);

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { dateStyle: "medium" });

export const formatTime = (date: string) =>
  new Date(date).toLocaleTimeString(undefined, { timeStyle: "short" });
