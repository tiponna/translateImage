import { NextResponse } from "next/server";
import { clearDriveCookies } from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const response = NextResponse.json({ connected: false });
  clearDriveCookies(response, request);
  return response;
}
