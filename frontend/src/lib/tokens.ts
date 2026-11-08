import { authorization, checkResponse, readResponse } from "./api";

export const scopes = ["read", "publish", "manage"] as const;
export type Scope = (typeof scopes)[number];

// Reading comes with every scope
export const scopeDetails: Record<
  Scope,
  { label: string; description: string }
> = {
  read: {
    label: "Read",
    description: "List your sites, their files, and your storage use.",
  },
  publish: {
    label: "Publish",
    description: "Create sites and update them.",
  },
  manage: {
    label: "Manage",
    description:
      "Take sites offline or online, describe them, and delete them.",
  },
};

export type ApiToken = {
  id: string;
  name: string;
  // Made by redoost login, or by hand for pipelines
  source: "cli" | "manual";
  scopes: Scope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

// The token itself is only ever in this response
export type CreatedToken = ApiToken & { token: string };

type TokenRequest = {
  name: string;
  scopes: Scope[];
  expires_at: string | null;
};

export async function listTokens(token: string) {
  const response = await fetch("/api/auth/tokens", {
    headers: authorization(token),
  });
  return readResponse<ApiToken[]>(response);
}

export async function createToken(request: TokenRequest, token: string) {
  const response = await fetch("/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify(request),
  });
  return readResponse<CreatedToken>(response);
}

export async function revokeToken(id: string, token: string) {
  const response = await fetch(`/api/auth/tokens/${id}`, {
    method: "DELETE",
    headers: authorization(token),
  });
  await checkResponse(response);
}
