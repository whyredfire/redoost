import type {
  ApiToken,
  AuthConfig,
  CliLogin,
  CreatedToken,
  DashboardConfig,
  Deployment,
  DeploymentChange,
  DeploymentUploads,
  Limits,
  ServerVersion,
  SignedIn,
  SiteManifest,
  StoredFile,
  TokenRequest,
  Usage,
  User,
  Version,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const isString = (value: unknown): value is string => typeof value === "string";

interface ErrorBody {
  detail?: string | { msg: string }[];
}

/** The message in an error response, as FastAPI-style {"detail"} bodies give it. */
export const detailMessage = (body: ErrorBody | null, status: number) => {
  const detail = body?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join("; ");
  }

  if (isString(detail)) {
    return detail;
  }

  return `Request failed (${status}).`;
};

export const checkResponse = async (response: Response) => {
  if (!response.ok) {
    // SAFETY: error bodies are {"detail"} or unreadable, and detailMessage handles either
    const body = (await response.json().catch(() => null)) as ErrorBody | null;

    throw new ApiError(response.status, detailMessage(body, response.status));
  }
};

/** The API's bulk endpoints take up to this many slugs a request. */
export const slugsPerRequest = 100;

const slugQuery = (slugs: string[]) => {
  const query = new URLSearchParams();

  for (const slug of slugs) {
    query.append("slug", slug);
  }

  return query;
};

const site = (slug: string) => `/api/deployments/${slug}`;

const json = <T>(method: string, body: T, signal?: AbortSignal) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

/**
 * A client for a Redoost server; server is its origin, or "" for the page's own.
 * Failed requests throw ApiError, network failures fetch's TypeError, and 401s
 * are left to callers to explain.
 */
export const createApi = ({
  server,
  token,
}: {
  server: string;
  token?: string;
}) => {
  const send = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${server}${path}`, { ...init, headers });
    await checkResponse(response);

    return response;
  };

  const read = async <T>(path: string, init?: RequestInit) => {
    const response = await send(path, init);
    // SAFETY: the API answers with the type each method names
    const body = (await response.json()) as T;

    return body;
  };

  const done = async (path: string, init?: RequestInit) => {
    await send(path, init);
  };

  return {
    version: () => read<ServerVersion>("/api/version"),
    dashboardConfig: () => read<DashboardConfig>("/config.json"),

    authConfig: () => read<AuthConfig>("/api/auth/config"),
    me: () => read<User>("/api/auth/me"),
    deleteMe: () => done("/api/auth/me", { method: "DELETE" }),
    signIn: (code: string, codeVerifier: string, redirectUri: string) =>
      read<SignedIn>(
        "/api/auth/token",
        json("POST", {
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
        })
      ),
    signInAsDev: () => read<SignedIn>("/api/auth/dev", { method: "POST" }),
    startCliLogin: () => read<CliLogin>("/api/auth/cli", { method: "POST" }),
    approveCliLogin: (id: string) =>
      done(`/api/auth/cli/${id}`, { method: "POST" }),
    claimCliLogin: async (
      id: string,
      claim: { secret: string; name: string }
    ) => {
      const response = await send(
        `/api/auth/cli/${id}/token`,
        json("POST", claim)
      );

      if (response.status === 202) {
        return null;
      }

      // SAFETY: once approved, the API answers with the sign-in
      return (await response.json()) as SignedIn;
    },

    listTokens: () => read<ApiToken[]>("/api/auth/tokens"),
    createToken: (request: TokenRequest) =>
      read<CreatedToken>("/api/auth/tokens", json("POST", request)),
    revokeToken: (id: string) =>
      done(`/api/auth/tokens/${id}`, { method: "DELETE" }),
    revokeCurrentToken: () =>
      done("/api/auth/tokens/current", { method: "DELETE" }),

    readLimits: () => read<Limits>("/api/deployments/limits"),
    readUsage: () => read<Usage>("/api/deployments/usage"),
    suggestSlugs: () => read<string[]>("/api/deployments/slugs"),
    listDeployments: () => read<Deployment[]>("/api/deployments"),
    readDeployment: (slug: string) => read<Deployment>(site(slug)),
    readFiles: (slug: string) => read<StoredFile[]>(`${site(slug)}/files`),
    createDeployment: (manifest: SiteManifest, signal?: AbortSignal) =>
      read<DeploymentUploads>(
        "/api/deployments",
        json("POST", manifest, signal)
      ),
    updateDeployment: (
      slug: string,
      manifest: SiteManifest,
      signal?: AbortSignal
    ) => read<DeploymentUploads>(site(slug), json("PUT", manifest, signal)),
    completeDeployment: (
      slug: string,
      manifest: SiteManifest,
      signal?: AbortSignal
    ) =>
      read<Deployment>(
        `${site(slug)}/complete`,
        json("POST", manifest, signal)
      ),
    cancelUpload: (slug: string) =>
      done(`${site(slug)}/cancel`, { method: "POST" }),
    changeDeployment: (slug: string, change: DeploymentChange) =>
      read<Deployment>(site(slug), json("PATCH", change)),
    deleteDeployment: (slug: string) => done(site(slug), { method: "DELETE" }),

    readVersions: (slug: string) => read<Version[]>(`${site(slug)}/versions`),
    restoreVersion: (slug: string, id: string) =>
      read<Deployment>(`${site(slug)}/versions/${id}/restore`, {
        method: "POST",
      }),
    describeVersion: (slug: string, id: string, description: string) =>
      read<Version>(
        `${site(slug)}/versions/${id}`,
        json("PATCH", { description })
      ),
    deleteVersion: (slug: string, id: string) =>
      done(`${site(slug)}/versions/${id}`, { method: "DELETE" }),
    pruneVersions: (slug: string) =>
      read<Deployment>(`${site(slug)}/versions`, { method: "DELETE" }),

    changeDeployments: (slugs: string[], enabled: boolean) =>
      read<{ changed: string[] }>(
        `/api/deployments?${slugQuery(slugs)}`,
        json("PATCH", { enabled })
      ),
    deleteDeployments: (slugs: string[]) =>
      read<{ deleted: string[] }>(`/api/deployments?${slugQuery(slugs)}`, {
        method: "DELETE",
      }),
  };
};

export type Api = ReturnType<typeof createApi>;
