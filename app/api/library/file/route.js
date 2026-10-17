import { NextResponse } from "next/server";
import { readAppFile } from "@/lib/drive-library";
import { driveError, requireAccessToken } from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const fileId = new URL(request.url).searchParams.get("id") || "";
    if (!fileId) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    const token = await requireAccessToken(request);
    const file = await readAppFile(token, fileId);
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return driveError(error);
  }
}
