import { createApi } from "@redoost/shared";

/** The API, which the dashboard shares an origin with. */
export const api = (token?: string | null) =>
  createApi({ server: "", token: token ?? undefined });
