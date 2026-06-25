import { selfHostRequest } from "./apiClient";
import { authResponseToSession, toAppAuthUser } from "./authSession";
import type { AppAuthSession, SelfHostAuthResponse } from "./types";

type AuthResult = {
  session: AppAuthSession | null;
  response: SelfHostAuthResponse;
};

export async function registerSelfHost(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  const response = await selfHostRequest<SelfHostAuthResponse>("/api/auth/register", {
    method: "POST",
    body: input,
  });
  return {
    response,
    session: authResponseToSession(response),
  };
}

export async function loginSelfHost(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const response = await selfHostRequest<SelfHostAuthResponse>("/api/auth/login", {
    method: "POST",
    body: input,
  });
  return {
    response,
    session: authResponseToSession(response),
  };
}

export async function refreshSelfHostSession(refreshToken: string): Promise<AuthResult> {
  const response = await selfHostRequest<SelfHostAuthResponse>("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
  return {
    response,
    session: authResponseToSession(response),
  };
}

export async function logoutSelfHost(refreshToken?: string | null) {
  if (!refreshToken) {
    return;
  }
  await selfHostRequest<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}

export async function requestSelfHostPasswordReset(email: string) {
  return selfHostRequest<SelfHostAuthResponse>("/api/auth/password/reset/request", {
    method: "POST",
    body: { email },
  });
}

export async function confirmSelfHostEmailVerification(token: string) {
  return selfHostRequest<SelfHostAuthResponse>("/api/auth/email/verify/confirm", {
    method: "POST",
    body: { token },
  });
}

export async function confirmSelfHostPasswordReset(input: {
  token: string;
  password: string;
}): Promise<AuthResult> {
  const response = await selfHostRequest<SelfHostAuthResponse>("/api/auth/password/reset/confirm", {
    method: "POST",
    body: input,
  });
  return {
    response,
    session: authResponseToSession(response),
  };
}

export async function loadSelfHostMe(accessToken: string) {
  const response = await selfHostRequest<SelfHostAuthResponse>("/api/me", {
    accessToken,
  });
  return toAppAuthUser(response.user);
}
