import { ApiError } from "@redoost/shared";
import type { AuthConfig, Provider, SignedIn, User } from "@redoost/shared";

import { api } from "./api";
import { clearSession, clearToken, loadToken, saveToken } from "./session";

export const providerNames: Record<Provider, string> = { google: "Google" };

const signInKey = "redoost.sign-in";
const redirectUri = `${location.origin}/auth/callback`;

const loadAuthConfig = async () => {
  try {
    return await api().authConfig();
  } catch {
    return { oidc: null, dev: false } satisfies AuthConfig;
  }
};

let user: User | null = null;

export const signedInUser = () => user;

const saveSignIn = (signedIn: SignedIn) => {
  ({ user } = signedIn);
  saveToken(signedIn.token);
};

const checkToken = async () => {
  const token = loadToken();

  if (!token) {
    return;
  }

  try {
    user = await api(token).me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
    }
  }
};

export const [authConfig] = await Promise.all([loadAuthConfig(), checkToken()]);

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");

const randomString = () =>
  base64url(crypto.getRandomValues(new Uint8Array(32)));

export const signIn = async () => {
  const { oidc } = authConfig;

  if (!oidc) {
    return;
  }

  const state = randomString();
  const verifier = randomString();

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );

  sessionStorage.setItem(
    signInKey,
    JSON.stringify({ state, verifier, returnTo: location.pathname })
  );

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
};

export interface Callback {
  code?: string;
  state?: string;
  error?: string;
}

export const finishSignIn = async ({ code, state, error }: Callback) => {
  const saved = sessionStorage.getItem(signInKey);
  sessionStorage.removeItem(signInKey);

  if (error) {
    throw new Error("Sign-in was cancelled or denied.");
  }

  const started: {
    state: string;
    verifier: string;
    returnTo: string;
  } | null = saved ? JSON.parse(saved) : null;

  if (!code || !started || started.state !== state) {
    throw new Error("This sign-in link has expired. Sign in again.");
  }

  saveSignIn(await api().signIn(code, started.verifier, redirectUri));
  clearSession();

  return started.returnTo;
};

export const signInAsDev = async () => {
  saveSignIn(await api().signInAsDev());
};

export const signOut = () => {
  clearSession();
  user = null;
  clearToken();
};

export const deleteAccount = async () => {
  const token = loadToken();

  if (!token) {
    return;
  }

  await api(token).deleteMe();
  signOut();
};

export const publishToken = () => {
  const token = loadToken();

  if (!token) {
    throw new Error("Sign in to publish.");
  }

  return token;
};
