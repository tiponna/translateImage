import { NextResponse } from "next/server";
import { cookieBase, googleAuthUrl, googleConfig, STATE_COOKIE } from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(errorUrl(request, "ยังไม่มี CLIENT_ID หรือ CLIENT_SECRET ใน .env.local"));
  }
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(googleAuthUrl(request, state));
  response.cookies.set(STATE_COOKIE, state, { ...cookieBase(request), maxAge: 600 });
  return response;
}

function errorUrl(request, message) {
  const url = new URL("/", request.url);
  url.searchParams.set("drive", "error");
  url.searchParams.set("message", message);
  return url;
}
