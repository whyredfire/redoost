export interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
  gzip: boolean;
  original_sha256: string;
}

export interface Deployment {
  slug: string;
  state: "uploading" | "ready";
  file_count: number;
  total_size: number;
  storage_size: number;
  version_count: number;
  enabled: boolean;
  description: string;
  created_at: string;
  expires_at: string | null;
  locked_until: string;
}

export type DeploymentUploads = Deployment & {
  upload_url: string;
  uploads: { path: string; fields: Record<string, string> }[];
};

/** What creating, updating or completing a site sends; left out, a field keeps its value. */
export interface SiteManifest {
  files: ManifestFile[];
  slug?: string;
  description?: string;
  version_description?: string;
  expires_at?: string | null;
}

export interface DeploymentChange {
  enabled?: boolean;
  description?: string;
  expires_at?: string | null;
}

export interface StoredFile {
  path: string;
  sha256: string | null;
  original_sha256: string | null;
}

export interface Version {
  id: string;
  created_at: string;
  file_count: number;
  size: number;
  description: string;
  current: boolean;
}

export interface Limits {
  max_file_size: number;
  max_deployment_size: number;
  max_deployment_files: number;
}

export interface Usage {
  used: number;
  limit: number;
}

export const scopes = ["read", "publish", "manage"] as const;

export type Scope = (typeof scopes)[number];

export interface ApiToken {
  id: string;
  name: string;
  source: "cli" | "manual";
  scopes: Scope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export type CreatedToken = ApiToken & { token: string };

export interface TokenRequest {
  name: string;
  scopes: Scope[];
  expires_at: string | null;
}

export type Provider = "google";

export interface AuthConfig {
  oidc: {
    provider: Provider;
    authorization_endpoint: string;
    client_id: string;
    scope: string;
  } | null;
  dev: boolean;
}

export interface User {
  id: string;
  provider: Provider;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface SignedIn {
  token: string;
  user: User;
}

export interface CliLogin {
  id: string;
  secret: string;
  expires_at: string;
}

export interface ServerVersion {
  version: string;
}

/** What the dashboard serves at /config.json. */
export interface DashboardConfig {
  sitesOrigin: string | null;
}

export const expired = (site: Deployment) =>
  site.expires_at !== null && Date.parse(site.expires_at) <= Date.now();

export const online = (site: Deployment) => site.enabled && !expired(site);
