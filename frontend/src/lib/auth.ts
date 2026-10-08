import { checkResponse, readResponse } from "./deploy";
import { clearSession, clearToken, loadToken, saveToken } from "./session";

type Provider = "google";

type AuthConfig = {
  oidc: {
    provider: Provider;
    authorization_endpoint: string;
    client_id: string;
    scope: string;
  } | null;
  // Local development signs in as a dev user instead
  dev: boolean;
};

export type User = {
  id: string;
  provider: Provider;
  email: string | null;
  name: string | null;
};

export const providerNames: Record<Provider, string> = { google: "Google" };

const signInKey = "redoost.sign-in";
const redirectUri = `${location.origin}/auth/callback`;

async function loadAuthConfig(): Promise<AuthConfig> {
  try {
    const response = await fetch("/api/auth/config");
    return await readResponse<AuthConfig>(response);
  } catch {
    // Without it, signing in isn't offered
    return { oidc: null, dev: false };
  }
}

// Set whenever the token is, so the header can show who's signed in
let user: User | null = null;

export function signedInUser() {
  return user;
}

// Dropped up front, so the dashboard asks for a new token instead of failing later
async function checkToken() {
  const token = loadToken();
  if (!token) return;
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (response?.status === 401) clearToken();
  if (response?.ok) {
    const me: User = await response.json();
    user = me;
  }
}

export const [authConfig] = await Promise.all([loadAuthConfig(), checkToken()]);

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function signIn() {
  const { oidc } = authConfig;
  if (!oidc) return;
  // PKCE, so a stolen code can't be exchanged without this browser's verifier
  const state = randomString();
  const verifier = randomString();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  sessionStorage.setItem(signInKey, JSON.stringify({ state, verifier }));

  const url = new URL(oidc.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: oidc.client_id,
    redirect_uri: redirectUri,
    scope: oidc.scope,
    state,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: "S256",
  }).toString();
  location.assign(url);
}

export type Callback = { code?: string; state?: string; error?: string };

export async function finishSignIn({ code, state, error }: Callback) {
  const saved = sessionStorage.getItem(signInKey);
  sessionStorage.removeItem(signInKey);
  if (error) throw new Error("Sign-in was cancelled or denied.");
  const started = saved
    ? (JSON.parse(saved) as { state: string; verifier: string })
    : null;
  if (!code || !started || started.state !== state) {
    throw new Error("This sign-in link has expired. Sign in again.");
  }

  const response = await fetch("/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: started.verifier,
      redirect_uri: redirectUri,
    }),
  });
  const signedIn = await readResponse<{ token: string; user: User }>(response);
  clearSession();
  user = signedIn.user;
  saveToken(signedIn.token);
}

export async function signInAsDev() {
  const response = await fetch("/api/auth/dev", { method: "POST" });
  const signedIn = await readResponse<{ token: string; user: User }>(response);
  user = signedIn.user;
  saveToken(signedIn.token);
}

export function signOut() {
  clearSession();
  user = null;
  clearToken();
}

// Removes the account and all its sites, then signs out
export async function deleteAccount() {
  const token = loadToken();
  if (!token) return;
  const response = await fetch("/api/auth/me", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await checkResponse(response);
  signOut();
}

export function publishToken() {
  const token = loadToken();
  if (!token) throw new Error("Sign in to publish.");
  return token;
}
