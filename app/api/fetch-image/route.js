import { NextResponse } from "next/server";
import { fetchImageAsDataUrl } from "@/lib/remote-image";

export const maxDuration = 20;

export async function POST(request) {
  try {
    const body = await request.json();
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl) {
      return NextResponse.json({ error: "กรุณาวาง URL รูปภาพ" }, { status: 400 });
    }

    const dataUrl = await fetchImageAsDataUrl(imageUrl);
    return NextResponse.json({ dataUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "ดึงรูปจาก URL ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
