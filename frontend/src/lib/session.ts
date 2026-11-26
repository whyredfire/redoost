import { ApiError } from "@redoost/shared";
import type { DeploymentUploads, ManifestFile } from "@redoost/shared";
import { createSignal } from "solid-js";

export interface UploadSession {
  deployment: DeploymentUploads;
  manifest: ManifestFile[];
  originalSize?: number;
  description?: string;
  note?: string;
}

const storageKey = "redoost.upload";
const tokenKey = "redoost.token";

export const loadSession = () => {
  try {
    const saved = sessionStorage.getItem(storageKey);

    if (saved) {
      const session: UploadSession = JSON.parse(saved);
      const { state, locked_until } = session.deployment;

      if (state === "ready" || Date.now() < Date.parse(locked_until)) {
        return session;
      }
    }
  } catch {
    clearSession();

    return null;
  }

  clearSession();

  return null;
};

export const saveSession = (session: UploadSession) => {
  sessionStorage.setItem(storageKey, JSON.stringify(session));
};

export const clearSession = () => {
  sessionStorage.removeItem(storageKey);
};

export const loadToken = () => localStorage.getItem(tokenKey);

const [token, setToken] = createSignal(loadToken());

addEventListener("storage", () => setToken(loadToken()));

export const saveToken = (value: string) => {
  localStorage.setItem(tokenKey, value);
  setToken(value);
};

export const clearToken = () => {
  localStorage.removeItem(tokenKey);
  setToken(null);
};

export const useToken = () => token;

export const loadSignedIn = async <T>(load: (token: string) => Promise<T>) => {
  const saved = loadToken();

  if (!saved) {
    return null;
  }

  try {
    return await load(saved);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();

      return null;
    }

    throw error;
  }
};
