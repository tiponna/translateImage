import { NextResponse } from "next/server";
import { isCjkSource, textLooksCjk } from "@/lib/languages";
import { runTextTranslate } from "@/lib/vision-translate";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const texts = Array.isArray(body?.texts) ? body.texts.map((text) => String(text || "")) : [];
    const sourceLanguage = body?.sourceLanguage || "auto";
    const pageKind = body?.pageKind === "manga" ? "manga" : "";
    if (!texts.length) {
      return NextResponse.json({ translations: [] });
    }
    if (texts.length > 80) {
      return NextResponse.json({ error: "ข้อความจาก OCR มากเกินไป" }, { status: 400 });
    }

    const cjk = pageKind === "manga" || isCjkSource(sourceLanguage) || textLooksCjk(texts.join(""));
    if (cjk) {
      return NextResponse.json({
        translations: texts,
        provider: "none",
        notes: "ยังไม่แปล — มังงะ/ญี่ปุ่น/จีน/เกาหลี ไม่ผ่านบริการแปลคำต่อคำ ใช้ Gemini ทั้งหน้า",
      });
    }

    try {
      const translations = await runTextTranslate({ texts, sourceLanguage });
      return NextResponse.json({ translations, provider: "gemini-lite" });
    } catch (error) {
      console.error("translate-text gemini-lite failed", error);
      const blob = texts.join("\n");
      const translated = await translateEnglishBlob(blob);
      const parts = String(translated || "").split("\n");
      return NextResponse.json({
        translations: texts.map((text, index) => (parts[index] || "").trim() || text),
        provider: "mymemory-en",
      });
    }
  } catch (error) {
    console.error("translate-text failed", error);
    return NextResponse.json(
      { error: "แปลข้อความไม่สำเร็จ (โหมดประหยัด RPD)" },
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
  if (!response.ok) return text;
  const data = await response.json();
  const translated = String(data?.responseData?.translatedText || "");
  if (!translated || /MYMEMORY WARNING/i.test(translated)) return text;
  return translated;
}
