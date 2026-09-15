import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";
import { generateText, Output } from "ai";
import { z } from "zod";

const BlockSchema = z.object({
  original: z.string(),
  translation: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  direction: z.enum(["horizontal", "vertical"]),
  background: z.enum(["light", "dark"]),
  shape: z.enum(["bubble", "box"]),
});

export const ResultSchema = z.object({
  kind: z.enum(["manga", "sign", "mixed", "other"]),
  detectedLanguageCode: z.string(),
  detectedLanguageName: z.string(),
  hasText: z.boolean(),
  originalText: z.string(),
  translation: z.string(),
  notes: z.string(),
  blocks: z.array(BlockSchema),
});

export function getVisionProvider(difficulty = "hard") {
  const requested = (process.env.TRANSLATE_PROVIDER || "auto").toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const xaiKey = process.env.XAI_API_KEY;

  if (requested === "gemini" || requested === "google") {
    if (!geminiKey) {
      throw missingKeyError(
        "ตั้งค่า GEMINI_API_KEY ใน .env.local — สร้างฟรีที่ https://aistudio.google.com/apikey",
      );
    }
    return geminiProvider(geminiKey, difficulty);
  }

  if (requested === "xai" || requested === "spacexai") {
    if (!xaiKey) {
      throw missingKeyError(
        "ตั้งค่า XAI_API_KEY ใน .env.local — สร้างคีย์ที่ https://console.x.ai",
      );
    }
    return xaiProvider();
  }

  if (geminiKey) return geminiProvider(geminiKey, difficulty);
  if (xaiKey) return xaiProvider();

  throw missingKeyError(
    "ยังไม่มีคีย์ฟรี: สร้าง GEMINI_API_KEY ที่ https://aistudio.google.com/apikey แล้วใส่ใน .env.local",
  );
}

function geminiProvider(apiKey, difficulty = "hard") {
  const google = createGoogleGenerativeAI({ apiKey });
  const hardModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const liteModel = process.env.GEMINI_MODEL_LITE || "gemini-3.1-flash-lite";
  const modelId = difficulty === "easy" ? liteModel : hardModel;
  return {
    id: "gemini",
    label: difficulty === "easy" ? "Gemini Flash-Lite" : "Gemini 3.6 Flash",
    model: google(modelId),
    modelId,
  };
}

function xaiProvider() {
  return {
    id: "spacexai",
    label: "SpaceXAI Grok",
    model: xai.responses("grok-4.6"),
    providerOptions: {
      xai: {
        store: false,
        reasoningEffort: "medium",
      },
    },
  };
}

function missingKeyError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

export async function runVisionTranslate({
  image,
  sourceHint,
  difficulty = "hard",
  pageKind = "",
}) {
  const provider = getVisionProvider(difficulty);
  const { output } = await generateText({
    model: provider.model,
    providerOptions: provider.providerOptions,
    output: Output.object({ schema: ResultSchema }),
    instructions: visionInstructions(sourceHint, pageKind),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: mediaTypeFromDataUrl(image),
            data: image,
          },
          {
            type: "text",
            text:
              pageKind === "manga"
                ? "This is a manga page. One block per speech bubble or SFX. Translate each full utterance into natural connected Thai, not word-by-word."
                : "Detect each complete text region. Translate each region into natural connected Thai, not isolated words.",
          },
        ],
      },
    ],
  });

  const blocks = normalizeBlocks(output.blocks);
  const originalText =
    output.originalText || blocks.map((block) => block.original).join("\n\n");
  const translation =
    output.translation && output.translation.trim()
      ? output.translation
      : blocks.map((block) => block.translation).filter(Boolean).join("\n\n");
  return {
    ...output,
    blocks,
    originalText,
    translation,
    targetLanguage: "th",
    targetLanguageName: "ไทย",
    provider: provider.id,
    providerLabel: provider.label,
    modelId: provider.modelId,
  };
}

function mediaTypeFromDataUrl(image) {
  const match = /^data:(image\/(?:jpeg|jpg|png));base64,/i.exec(image);
  const type = match?.[1]?.toLowerCase();
  return type === "image/jpg" ? "image/jpeg" : type || "image/jpeg";
}

function visionInstructions(sourceHint, pageKind) {
  const mangaRules =
    pageKind === "manga"
      ? `
Manga / comics:
- ONE block = ONE speech bubble, ONE caption, or ONE sound-effect. Never split a bubble into per-line or per-character boxes.
- Put the full utterance in original as a single string (use \\n only between two distinct sentences in the same bubble).
- Translate that whole utterance into natural spoken Thai as ONE phrase. Do not translate word-by-word, glyph-by-glyph, or leave disconnected fragments.
- Bad: separate blocks 「フロント」「は」「もらったぜ」 with Thai 「หน้า」 「ได้」 「แล้ว」.
- Good: one bubble block 「フロントはもらったぜ」 → 「เลนส์หน้า ฉันเอาแล้ว」.
- Box tightly wraps THAT balloon only (usually 4–18% of the page). Do not cover the whole panel, faces, or empty art. Do not pad into neighboring balloons.
- Adjacent balloons stay SEPARATE even if they sit close together.
- SFX like ドーン stay one onomatopoeia in Thai (โดน, ปัง, etc.).
- Reading order for originalText/translation: right-to-left, then top-to-bottom.`
      : "";

  return `You are a manga/sign translator. OCR and Thai translation happen together.

${sourceHint}

Rules:
- Japanese, English, Chinese only. Ignore tiny watermarks.
- Each block is a complete readable unit (bubble, caption, slogan), not a fragment.
- Bounding boxes are fractions of the FULL image: x,y top-left, width/height, all 0..1. Keep boxes tight. A box must not swallow a whole panel.
- direction: vertical for tategaki, otherwise horizontal.
- background: light or dark. shape: bubble or box.
- translation: fluent connected Thai. Keep names. Do not chop words. Do not output isolated particles.
- originalText / translation: blocks joined with blank lines in reading order.
- If no text, hasText=false, blocks=[].
- notes: short Thai. "" if none.
- kind: manga | sign | mixed | other.
${mangaRules}`;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function normalizeBlocks(blocks) {
  const mapped = (blocks || [])
    .map((block) => {
      const x = clamp01(block.x);
      const y = clamp01(block.y);
      const width = Math.min(1 - x, Math.max(0, Number(block.width) || 0));
      const height = Math.min(1 - y, Math.max(0, Number(block.height) || 0));
      return {
        original: String(block.original || "").trim(),
        translation: String(block.translation || "").trim(),
        x,
        y,
        width,
        height,
        direction: block.direction === "vertical" ? "vertical" : "horizontal",
        background: block.background === "dark" ? "dark" : "light",
        shape: block.shape === "bubble" ? "bubble" : "box",
        source: "gemini",
        unclear: false,
      };
    })
    .filter(
      (block) =>
        block.width >= 0.012 &&
        block.height >= 0.012 &&
        (block.original || block.translation),
    );
  return mergeOverlappingBlocks(mapped).map(capBlockArea);
}

function capBlockArea(block) {
  const maxArea = 0.16;
  const size = area(block);
  if (size <= maxArea) return block;
  const scale = Math.sqrt(maxArea / size);
  const width = Math.max(0.06, block.width * scale);
  const height = Math.max(0.06, block.height * scale);
  return {
    ...block,
    x: block.x + (block.width - width) / 2,
    y: block.y + (block.height - height) / 2,
    width,
    height,
  };
}

function area(block) {
  return block.width * block.height;
}

function intersection(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function shouldMerge(a, b) {
  const overlap = intersection(a, b);
  if (!overlap) return false;
  const smaller = Math.min(area(a), area(b));
  const larger = Math.max(area(a), area(b));
  if (smaller <= 0) return false;
  // Only merge a fragment contained inside the same balloon, never neighboring balloons.
  return overlap / smaller >= 0.82 && smaller / larger <= 0.55;
}

function joinPhrase(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  const thai = /[\u0E00-\u0E7F]/;
  if (thai.test(a) && thai.test(b)) return `${a}${b}`;
  return `${a} ${b}`;
}

function mergeTwo(a, b) {
  const first = a.y < b.y - 0.01 || (Math.abs(a.y - b.y) < 0.01 && a.x > b.x) ? a : b;
  const second = first === a ? b : a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return {
    ...first,
    original: joinPhrase(first.original, second.original),
    translation: joinPhrase(first.translation, second.translation),
    x,
    y,
    width: right - x,
    height: bottom - y,
    shape: a.shape === "bubble" || b.shape === "bubble" ? "bubble" : "box",
  };
}

function mergeOverlappingBlocks(blocks) {
  const items = [...blocks];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!shouldMerge(items[i], items[j])) continue;
        items[i] = mergeTwo(items[i], items[j]);
        items.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return items;
}
