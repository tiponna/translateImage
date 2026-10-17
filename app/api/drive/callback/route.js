import { NextResponse } from "next/server";
import {
  applyRefreshCookie,
  exchangeAuthCode,
  readOAuthState,
} from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(home(request, oauthError === "access_denied" ? "ยกเลิกการเชื่อม Drive" : "เชื่อม Drive ไม่สำเร็จ"));
  }

  const state = url.searchParams.get("state") || "";
  if (!state || state !== readOAuthState(request)) {
    return NextResponse.redirect(home(request, "คำขอเชื่อม Drive ไม่ถูกต้อง ลองใหม่"));
  }

  const code = url.searchParams.get("code") || "";
  if (!code) return NextResponse.redirect(home(request, "Google ไม่ได้ส่งรหัสกลับมา"));

  try {
    const refreshToken = await exchangeAuthCode(request, code);
    const response = NextResponse.redirect(new URL("/?drive=connected", request.url));
    applyRefreshCookie(response, request, refreshToken);
    return response;
  } catch (error) {
    return NextResponse.redirect(home(request, error.message || "เชื่อม Drive ไม่สำเร็จ"));
  }
}

function home(request, message) {
  const url = new URL("/", request.url);
  url.searchParams.set("drive", "error");
  url.searchParams.set("message", message);
  return url;
}
