import { NextResponse } from "next/server";
import { accessTokenFromRefresh, googleConfig, readRefreshToken } from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { clientId, clientSecret } = googleConfig();
  const configured = Boolean(clientId && clientSecret);
  const refreshToken = readRefreshToken(request);
  if (!configured || !refreshToken) {
    return NextResponse.json({ configured, connected: false });
  }
  try {
    await accessTokenFromRefresh(refreshToken);
    return NextResponse.json({ configured: true, connected: true });
  } catch {
    return NextResponse.json({ configured: true, connected: false, expired: true });
  }
}
