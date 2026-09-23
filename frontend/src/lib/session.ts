import type { UploadSession } from "./deploy";

const storageKey = "redoost.upload";

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
