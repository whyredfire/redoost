import { useSyncExternalStore } from "react";
import type { UploadSession } from "./deploy";

const storageKey = "redoost.upload";
const tokenKey = "redoost.token";

export function loadSession(): UploadSession | null {
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const session = JSON.parse(saved) as UploadSession;
      const { state, expires_at } = session.deployment;
      if (state === "ready" || Date.now() < Date.parse(expires_at)) {
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

const tokenListeners = new Set<() => void>();

function tokenChanged() {
  for (const listener of tokenListeners) listener();
}

// Kept across tabs, so every tab acts as the same user
export function loadToken() {
  return localStorage.getItem(tokenKey);
}

export function saveToken(token: string) {
  localStorage.setItem(tokenKey, token);
  tokenChanged();
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
  tokenChanged();
}

function subscribeToken(listener: () => void) {
  tokenListeners.add(listener);
  // Fired for changes made in other tabs
  window.addEventListener("storage", listener);
  return () => {
    tokenListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useToken() {
  return useSyncExternalStore(subscribeToken, loadToken);
}
