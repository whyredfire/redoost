import { authorization, checkResponse, readResponse } from "./api";

export type ManifestFile = {
  path: string;
  size: number;
  sha256: string;
  gzip: boolean;
};

export type Deployment = {
  slug: string;
  state: "uploading" | "ready";
  file_count: number;
  total_size: number;
  // Every kept version, which is what counts toward storage
  storage_size: number;
  version_count: number;
  enabled: boolean;
  description: string;
  created_at: string;
  expires_at: string;
};

export type StoredFile = { path: string; sha256: string | null };

export type Version = {
  id: string;
  created_at: string;
  file_count: number;
  size: number;
  description: string;
  current: boolean;
};

export type Limits = {
  max_file_size: number;
  max_deployment_size: number;
  max_deployment_files: number;
};

export type Usage = { used: number; limit: number };

export type DeploymentUploads = Deployment & {
  upload_url: string;
  // Only new and changed files when updating a site
  uploads: { path: string; fields: Record<string, string> }[];
};

export type UploadSession = {
  deployment: DeploymentUploads;
  manifest: ManifestFile[];
  // Size before compression; missing in sessions saved by older versions
  originalSize?: number;
  // Left out to keep an updated site's description as it is
  description?: string;
  // What the version changes, if the user said
  note?: string;
};

type DeploymentChange = { enabled?: boolean; description?: string };

export async function createDeployment(
  files: ManifestFile[],
  description: string | undefined,
  note: string | undefined,
  token: string,
  signal: AbortSignal,
) {
  const response = await fetch("/api/deployments", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify({ files, description, version_description: note }),
    signal,
  });
  return readResponse<DeploymentUploads>(response);
}

export async function readFiles(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}/files`, {
    headers: authorization(token),
  });
  return readResponse<StoredFile[]>(response);
}

export async function updateDeployment(
  slug: string,
  files: ManifestFile[],
  token: string,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/deployments/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify({ files }),
    signal,
  });
  return readResponse<DeploymentUploads>(response);
}

// Updates take the description here, so a failed update keeps the old one
export async function completeDeployment(
  slug: string,
  files: ManifestFile[],
  description: string | undefined,
  note: string | undefined,
  token: string,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/deployments/${slug}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify({ files, description, version_description: note }),
    signal,
  });
  return readResponse<Deployment>(response);
}

// Frees the site for another update
export async function cancelUpload(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}/cancel`, {
    method: "POST",
    headers: authorization(token),
  });
  await checkResponse(response);
}

export async function readDeployment(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}`, {
    headers: authorization(token),
  });
  return readResponse<Deployment>(response);
}

export async function readVersions(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}/versions`, {
    headers: authorization(token),
  });
  return readResponse<Version[]>(response);
}

// Points the site at a kept version again; nothing is uploaded
export async function restoreVersion(slug: string, id: string, token: string) {
  const response = await fetch(
    `/api/deployments/${slug}/versions/${id}/restore`,
    { method: "POST", headers: authorization(token) },
  );
  return readResponse<Deployment>(response);
}

export async function describeVersion(
  slug: string,
  id: string,
  description: string,
  token: string,
) {
  const response = await fetch(`/api/deployments/${slug}/versions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify({ description }),
  });
  return readResponse<Version>(response);
}

export async function deleteVersion(slug: string, id: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}/versions/${id}`, {
    method: "DELETE",
    headers: authorization(token),
  });
  await checkResponse(response);
}

// Deletes every version but the one being served
export async function pruneVersions(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}/versions`, {
    method: "DELETE",
    headers: authorization(token),
  });
  return readResponse<Deployment>(response);
}

export async function listDeployments(token: string) {
  const response = await fetch("/api/deployments", {
    headers: authorization(token),
  });
  return readResponse<Deployment[]>(response);
}

export async function readUsage(token: string) {
  const response = await fetch("/api/deployments/usage", {
    headers: authorization(token),
  });
  return readResponse<Usage>(response);
}

export async function readLimits() {
  const response = await fetch("/api/deployments/limits");
  return readResponse<Limits>(response);
}

export async function changeDeployment(
  slug: string,
  change: DeploymentChange,
  token: string,
) {
  const response = await fetch(`/api/deployments/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify(change),
  });
  return readResponse<Deployment>(response);
}

export async function deleteDeployment(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}`, {
    method: "DELETE",
    headers: authorization(token),
  });
  await checkResponse(response);
}

// The API takes up to 100 sites a request; returns the ones whose request failed.
// Sites that no longer exist, like ones deleted in another tab, are skipped.
async function inBatches(
  slugs: string[],
  send: (query: URLSearchParams) => Promise<Response>,
) {
  const failed: string[] = [];
  for (let start = 0; start < slugs.length; start += 100) {
    const batch = slugs.slice(start, start + 100);
    try {
      await checkResponse(
        await send(new URLSearchParams(batch.map((slug) => ["slug", slug]))),
      );
    } catch {
      failed.push(...batch);
    }
  }
  return failed;
}

export function deleteDeployments(slugs: string[], token: string) {
  return inBatches(slugs, (query) =>
    fetch(`/api/deployments?${query}`, {
      method: "DELETE",
      headers: authorization(token),
    }),
  );
}

export function changeDeployments(
  slugs: string[],
  enabled: boolean,
  token: string,
) {
  return inBatches(slugs, (query) =>
    fetch(`/api/deployments?${query}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authorization(token) },
      body: JSON.stringify({ enabled }),
    }),
  );
}
