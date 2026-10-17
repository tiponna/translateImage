import { NextResponse } from "next/server";
import { isCjkSource, textLooksCjk } from "@/lib/languages";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const texts = Array.isArray(body?.texts) ? body.texts.map((text) => String(text || "")) : [];
    const sourceLanguage = body?.sourceLanguage || "auto";
    const pageKind = body?.pageKind === "manga" ? "manga" : "";
    if (!texts.length) {
      return NextResponse.json({ translations: [], provider: "none", notes: "" });
    }
    if (texts.length > 80) {
      return NextResponse.json({ error: "ข้อความจาก OCR มากเกินไป" }, { status: 400 });
    }

    if (pageKind === "manga" || isCjkSource(sourceLanguage) || textLooksCjk(texts.join(""))) {
      return NextResponse.json({
        translations: texts.map(() => ""),
        provider: "none",
        notes: "ยังไม่แปล — ญี่ปุ่น จีน และเกาหลีไม่ผ่านบริการแปลคำต่อคำ ใช้ Gemini ทั้งหน้า",
      });
    }

    const blob = texts.join("\n");
    const translated = await translateEnglishBlob(blob);
    const unchanged =
      !translated || translated.trim() === blob.trim() || /MYMEMORY WARNING/i.test(translated);
    if (unchanged) {
      return NextResponse.json({
        translations: texts.map(() => ""),
        provider: "none",
        notes: "แปลป้ายภาษาอังกฤษไม่สำเร็จในโหมดไม่ใช้โควต้า",
      });
    }

    const parts = String(translated).split("\n");
    return NextResponse.json({
      translations: texts.map((text, index) => {
        const line = (parts[index] || "").trim();
        if (!line || line === String(text).trim() || /MYMEMORY WARNING/i.test(line)) return "";
        return line;
      }),
      provider: "mymemory-en",
      notes: "",
    });
  } catch (error) {
    console.error("translate-text failed", error);
    return NextResponse.json(
      { error: "แปลข้อความไม่สำเร็จ (โหมดไม่ใช้โควต้า)" },
      { status: 502 },
    );
  }
}

async function translateEnglishBlob(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent("en|th")}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return "";
  const data = await response.json();
  return String(data?.responseData?.translatedText || "");
}
