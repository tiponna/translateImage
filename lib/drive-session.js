import { NextResponse } from "next/server";

const REFRESH_COOKIE = "phap_drive_rt";
const STATE_COOKIE = "phap_drive_state";
const SCOPE = "https://www.googleapis.com/auth/drive";

export function googleConfig() {
  return {
    clientId: process.env.CLIENT_ID || "",
    clientSecret: process.env.CLIENT_SECRET || "",
  };
}

export function redirectUri(request) {
  const url = new URL(request.url);
  return `${url.origin}/api/drive/callback`;
}

export function cookieBase(request) {
  const url = new URL(request.url);
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
  };
}

export function readRefreshToken(request) {
  return request.cookies.get(REFRESH_COOKIE)?.value || "";
}

export function readOAuthState(request) {
  return request.cookies.get(STATE_COOKIE)?.value || "";
}

export function applyRefreshCookie(response, request, refreshToken) {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    ...cookieBase(request),
    maxAge: 60 * 60 * 24 * 180,
  });
  response.cookies.set(STATE_COOKIE, "", { ...cookieBase(request), maxAge: 0 });
}

export function clearDriveCookies(response, request) {
  const base = cookieBase(request);
  response.cookies.set(REFRESH_COOKIE, "", { ...base, maxAge: 0 });
  response.cookies.set(STATE_COOKIE, "", { ...base, maxAge: 0 });
}

export function googleAuthUrl(request, state) {
  const { clientId } = googleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeAuthCode(request, code) {
  const { clientId, clientSecret } = googleConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(request),
    grant_type: "authorization_code",
  });
  const data = await postToken(body);
  if (!data.refresh_token) {
    throw new Error("Google ไม่ได้ให้ refresh token กดเชื่อมใหม่");
  }
  return data.refresh_token;
}

export async function accessTokenFromRefresh(refreshToken) {
  const { clientId, clientSecret } = googleConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const data = await postToken(body);
  return data.access_token;
}

export async function requireAccessToken(request) {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) {
    const error = new Error("ยังไม่มี CLIENT_ID หรือ CLIENT_SECRET ใน .env.local");
    error.status = 500;
    throw error;
  }
  const refreshToken = readRefreshToken(request);
  if (!refreshToken) {
    const error = new Error("ยังไม่ได้เชื่อม Google Drive");
    error.status = 401;
    throw error;
  }
  try {
    return await accessTokenFromRefresh(refreshToken);
  } catch (error) {
    const wrapped = new Error("การเชื่อม Drive หมดอายุ กดเชื่อมใหม่");
    wrapped.status = 401;
    wrapped.cause = error;
    throw wrapped;
  }
}

async function postToken(body) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error_description || data.error || "ขอโทเค็น Google ไม่สำเร็จ";
    throw new Error(message);
  }
  return data;
}

export function driveError(error) {
  const status = Number(error?.status) || 500;
  return NextResponse.json(
    { error: error?.message || "เชื่อม Google Drive ไม่สำเร็จ" },
    { status },
  );
}

export { REFRESH_COOKIE, STATE_COOKIE };
