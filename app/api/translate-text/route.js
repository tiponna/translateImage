import { NextResponse } from "next/server";

export const maxDuration = 30;

const LANGPAIR = {
  auto: "Autodetect|th",
  ja: "ja|th",
  en: "en|th",
  zh: "zh-CN|th",
};

export async function POST(request) {
  try {
    const body = await request.json();
    const texts = Array.isArray(body?.texts) ? body.texts.map((text) => String(text || "")) : [];
    const sourceLanguage = body?.sourceLanguage || "auto";
    if (!texts.length) {
      return NextResponse.json({ translations: [] });
    }
    if (texts.length > 80) {
      return NextResponse.json({ error: "ข้อความจาก OCR มากเกินไป" }, { status: 400 });
    }

    const langpair = LANGPAIR[sourceLanguage] || LANGPAIR.auto;
    const translations = [];
    for (const chunk of chunkTexts(texts, 420)) {
      const translated = await translateChunk(chunk.joined, langpair);
      const parts = translated.split("\n");
      chunk.items.forEach((item, index) => {
        translations[item.index] = (parts[index] || item.text).trim() || item.text;
      });
    }

    return NextResponse.json({
      translations: texts.map((text, index) => translations[index] || text),
    });
  } catch (error) {
    console.error("translate-text failed", error);
    return NextResponse.json(
      { error: "แปลข้อความไม่สำเร็จ (โหมดประหยัด RPD)" },
      { status: 502 },
    );
  }
}

function chunkTexts(texts, maxChars) {
  const chunks = [];
  let current = [];
  let size = 0;

  texts.forEach((text, index) => {
    const clipped = text.slice(0, maxChars);
    if (current.length && size + clipped.length + 1 > maxChars) {
      chunks.push(formatChunk(current));
      current = [];
      size = 0;
    }
    current.push({ index, text: clipped });
    size += clipped.length + 1;
  });
  if (current.length) chunks.push(formatChunk(current));
  return chunks;
}

function formatChunk(items) {
  return {
    items,
    joined: items.map((item) => item.text).join("\n"),
  };
}

async function translateChunk(text, langpair) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
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
