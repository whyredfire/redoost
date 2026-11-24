import { createSignal } from "solid-js";
import { ApiError } from "./api";
import type { UploadSession } from "./deploy";

const storageKey = "redoost.upload";
const tokenKey = "redoost.token";

export function loadSession(): UploadSession | null {
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const session = JSON.parse(saved) as UploadSession;
      const { state, locked_until } = session.deployment;
      if (state === "ready" || Date.now() < Date.parse(locked_until)) {
        return session;
      }
    }
  } catch {
    // Malformed sessions are discarded below
  }
  clearSession();
  return null;
}

export function saveSession(session: UploadSession) {
  sessionStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(storageKey);
}

// Kept across tabs, so every tab acts as the same user
export function loadToken() {
  return localStorage.getItem(tokenKey);
}

const [token, setToken] = createSignal(loadToken());
addEventListener("storage", () => setToken(loadToken()));

export function saveToken(value: string) {
  localStorage.setItem(tokenKey, value);
  setToken(value);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
  setToken(null);
}

export function useToken() {
  return token;
}

// Null when signed out, or when the token turns out expired, so pages ask to sign in
export async function loadSignedIn<T>(
  load: (token: string) => Promise<T>,
): Promise<T | null> {
  const token = loadToken();
  if (!token) return null;
  try {
    return await load(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return null;
    }
    throw error;
  }
}
