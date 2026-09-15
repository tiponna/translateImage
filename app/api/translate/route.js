import { NextResponse } from "next/server";
import { getSourceLanguage } from "@/lib/languages";
import { fetchImageAsDataUrl } from "@/lib/remote-image";
import { runVisionTranslate } from "@/lib/vision-translate";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    let image = body?.image;
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const sourceLanguage = body?.sourceLanguage || "auto";
    const region = body?.region === true;
    const difficulty = body?.difficulty === "easy" ? "easy" : "hard";
    const pageKind = body?.pageKind === "manga" ? "manga" : "";

    if ((!image || typeof image !== "string") && imageUrl) {
      image = await fetchImageAsDataUrl(imageUrl);
    }

    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "กรุณาอัปโหลดรูป หรือวาง URL รูปภาพ" },
        { status: 400 },
      );
    }

    if (!/^data:image\/(?:jpeg|jpg|png);base64,/i.test(image)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์ JPEG และ PNG" },
        { status: 400 },
      );
    }

    const base64 = image.split(",")[1] || "";
    const bytes = Math.ceil((base64.length * 3) / 4);
    if (bytes > 18 * 1024 * 1024) {
      return NextResponse.json(
        { error: "ไฟล์ใหญ่เกินไป (สูงสุด 18MB)" },
        { status: 413 },
      );
    }

    const source = getSourceLanguage(sourceLanguage);
    if (!source) {
      return NextResponse.json({ error: "ไม่รองรับภาษานี้" }, { status: 400 });
    }

    let sourceHint =
      source.code === "auto"
        ? "Auto-detect the source language. Prioritize Japanese, English, and Chinese (Simplified or Traditional)."
        : `The source language is ${source.englishName}.`;
    if (region) {
      sourceHint +=
        " This image is a crop of ONE text region. Return a single block covering the lettering (x/y near 0, width/height near 1). Translate the full utterance into one connected Thai phrase, not separate words.";
    }

    const output = await runVisionTranslate({ image, sourceHint, difficulty, pageKind });
    return NextResponse.json(output);
  } catch (error) {
    console.error("translate failed", error);
    const status = error.status === 503 ? 503 : 502;
    return NextResponse.json({ error: mapTranslateError(error) }, { status });
  }
}

function mapTranslateError(error) {
  if (error.status === 503 && error.message) return error.message;

  const raw = String(error?.message || "");
  if (/no longer available|not found|not supported/i.test(raw)) {
    return "โมเดล Gemini นี้ใช้กับบัญชีใหม่ไม่ได้แล้ว ลองรีเฟรชหน้าแล้วแปลอีกครั้ง";
  }
  if (/quota|rate limit|resource.?exhausted|429/i.test(raw)) {
    return "โควต้าฟรี Gemini เต็มแล้ว รอสักครู่หรือลองใหม่พรุ่งนี้";
  }
  if (/api key|unauthorized|401|API_KEY|permission/i.test(raw)) {
    return "API key ไม่ถูกต้อง หรือโควต้าฟรีหมดแล้ว";
  }
  if (/URL|ดึงรูป/.test(raw)) return raw;
  return raw ? `แปลไม่สำเร็จ: ${raw.slice(0, 180)}` : "แปลไม่สำเร็จ ลองใหม่อีกครั้ง";
}
