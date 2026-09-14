import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const LANG_NAMES: Record<string, string> = {
  auto: "auto-detect",
  en: "English",
  th: "Thai",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  vi: "Vietnamese",
  id: "Indonesian",
  es: "Spanish",
  fr: "French",
  de: "German",
};

async function translateWithOpenAI(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const source =
    sourceLang === "auto"
      ? "the original language (auto-detect)"
      : LANG_NAMES[sourceLang] || sourceLang;
  const target = LANG_NAMES[targetLang] || targetLang;

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a precise translator. Translate the user's text accurately. Preserve line breaks, numbers, prices, and formatting. Return only the translation, no explanations.",
      },
      {
        role: "user",
        content: `Translate from ${source} to ${target}:\n\n${text}`,
      },
    ],
    temperature: 0.2,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

async function translateWithMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const langpair = `${sourceLang === "auto" ? "en" : sourceLang}|${targetLang}`;
  // MyMemory จำกัดความยาว — แบ่งเป็นชิ้น
  const chunks = text.split(/\n+/).filter(Boolean);
  const lines: string[] = [];

  for (const chunk of chunks.length ? chunks : [text]) {
    const pieces: string[] = [];
    let rest = chunk;
    while (rest.length > 0) {
      pieces.push(rest.slice(0, 450));
      rest = rest.slice(450);
    }
    const translatedParts: string[] = [];
    for (const piece of pieces) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(piece)}&langpair=${langpair}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`แปลไม่สำเร็จ (${res.status})`);
      const data = (await res.json()) as {
        responseData?: { translatedText?: string };
        responseStatus?: number;
      };
      const translated = data.responseData?.translatedText;
      if (!translated) throw new Error("แปลไม่สำเร็จ");
      translatedParts.push(translated);
    }
    lines.push(translatedParts.join(""));
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body.text || "").trim();
    const sourceLang = String(body.sourceLang || "auto");
    const targetLang = String(body.targetLang || "th");

    if (!text) {
      return NextResponse.json({ error: "ไม่มีข้อความให้แปล" }, { status: 400 });
    }
    if (sourceLang !== "auto" && sourceLang === targetLang) {
      return NextResponse.json({ translatedText: text, provider: "passthrough" });
    }

    let translatedText: string;
    let provider: string;

    if (process.env.OPENAI_API_KEY) {
      translatedText = await translateWithOpenAI(text, sourceLang, targetLang);
      provider = "openai";
    } else {
      translatedText = await translateWithMyMemory(text, sourceLang, targetLang);
      provider = "mymemory";
    }

    return NextResponse.json({ translatedText, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "แปลล้มเหลว";
    console.error("[translate]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
