import { NextResponse } from "next/server";
import { listLibrary } from "@/lib/drive-library";
import { driveError, requireAccessToken } from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const token = await requireAccessToken(request);
    return NextResponse.json(await listLibrary(token));
  } catch (error) {
    return driveError(error);
  }
}
