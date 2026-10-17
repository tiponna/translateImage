import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { envKeyForSlot, normalizeGeminiSlot } from "@/lib/gemini-key";
import { getSourceLanguage } from "@/lib/languages";

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
  blocks: z.array(BlockSchema),
});

export function getVisionProvider(difficulty = "hard", keyChoice = {}) {
  const requested = (process.env.TRANSLATE_PROVIDER || "auto").toLowerCase();
  const custom = String(keyChoice.geminiKey || "").trim();
  const slot = normalizeGeminiSlot(keyChoice.geminiSlot);
  const slotKey = envKeyForSlot(slot);
  const geminiKey = custom || slotKey || envKeyForSlot("primary");
  const xaiKey = process.env.XAI_API_KEY;

  if (custom) {
    if (custom.length < 8 || custom.length > 256) {
      throw missingKeyError("รูปแบบ API key ไม่ถูกต้อง");
    }
    return geminiProvider(custom, difficulty);
  }

  if (slot !== "primary") {
    if (!slotKey) {
      throw missingKeyError(
        "ยังไม่มีคีย์สำรองที่เลือก — ใส่ในตั้งค่า หรือเพิ่มใน .env.local",
      );
    }
    return geminiProvider(slotKey, difficulty);
  }

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
  sourceLanguage = "auto",
  geminiKey = "",
  geminiSlot = "primary",
}) {
  const provider = getVisionProvider(difficulty, { geminiKey, geminiSlot });
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
          { type: "text", text: "OCR + Thai. One block per bubble or slogan." },
        ],
      },
    ],
  });

  const blocks = normalizeBlocks(output.blocks);
  const originalText = blocks.map((block) => block.original).filter(Boolean).join("\n\n");
  const translation = blocks.map((block) => block.translation).filter(Boolean).join("\n\n");
  const kind = output.kind || (pageKind === "manga" ? "manga" : "sign");
  const language = languageFromSource(sourceLanguage, kind);
  return {
    kind,
    detectedLanguageCode: language.code,
    detectedLanguageName: language.name,
    hasText: blocks.some((block) => block.original || block.translation),
    originalText,
    translation,
    notes: "",
    blocks,
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
  const manga =
    pageKind === "manga"
      ? "Manga: one block per balloon/SFX, never split. Adjacent balloons stay separate. Tight boxes. RTL then TTB."
      : "Signs: one block per complete line or slogan.";
  return `OCR and translate to natural Thai. ${sourceHint}
${manga}
Boxes x,y,width,height are 0..1 of the full image, tight on lettering.
direction: vertical if tategaki else horizontal. background: light|dark. shape: bubble|box.
If no text, blocks=[]. kind: manga|sign|mixed|other.`;
}

function languageFromSource(sourceLanguage, kind) {
  const source = getSourceLanguage(sourceLanguage);
  if (source && source.code !== "auto") {
    return { code: source.code, name: source.nativeName };
  }
  if (kind === "manga") return { code: "ja", name: "日本語" };
  return { code: "auto", name: "Auto" };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

const TextResultSchema = z.object({
  translations: z.array(z.string()),
});

export async function runTextTranslate({
  texts,
  sourceLanguage = "auto",
  geminiKey = "",
  geminiSlot = "primary",
}) {
  const provider = getVisionProvider("easy", { geminiKey, geminiSlot });
  const lines = (texts || []).map((text) => String(text || ""));
  const { output } = await generateText({
    model: provider.model,
    providerOptions: provider.providerOptions,
    output: Output.object({ schema: TextResultSchema }),
    instructions: `You translate printed signs, menus, and captions into natural Thai.

Rules:
- Natural connected Thai for signs and dialogue. Combine into sentences. Never translate word-by-word or glyph-by-glyph.
- Keep proper names as-is.
- Return exactly ${lines.length} strings in translations, same order as the input lines.
- If a source line is unreadable garbage, copy that line unchanged. Do not guess.
- Do not add commentary, numbering, or extra lines.`,
    messages: [
      {
        role: "user",
        content: `Source language hint: ${sourceLanguage}\nLine count: ${lines.length}\n\n${lines.join("\n")}`,
      },
    ],
  });

  let raw = Array.isArray(output?.translations) ? output.translations.map((item) => String(item || "")) : [];
  if (raw.length === 1 && lines.length > 1) {
    raw = String(raw[0]).split("\n");
  }
  return lines.map((text, index) => {
    const translated = String(raw[index] || "").trim();
    return translated || text;
  });
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
  return mergeShortAdjacentBlocks(mergeOverlappingBlocks(mapped)).map(capBlockArea);
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

function compactLen(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function joinPhrase(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  const thai = /[\u0E00-\u0E7F]/;
  if (cjk.test(a) || cjk.test(b)) return `${a}${b}`;
  if (thai.test(a) && thai.test(b)) return `${a}${b}`;
  return `${a} ${b}`;
}

function mergeTwo(a, b) {
  const vertical = a.direction === "vertical" || b.direction === "vertical";
  const first = vertical
    ? a.y < b.y - 0.01 || (Math.abs(a.y - b.y) < 0.01 && a.x > b.x)
      ? a
      : b
    : a.x < b.x - 0.01 || (Math.abs(a.x - b.x) < 0.01 && a.y < b.y)
      ? a
      : b;
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
  return mergeWhile(blocks, shouldMerge);
}

function mergeShortAdjacentBlocks(blocks) {
  return mergeWhile(blocks, shouldMergeShort);
}

function mergeWhile(blocks, predicate) {
  const items = [...blocks];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!predicate(items[i], items[j])) continue;
        items[i] = mergeTwo(items[i], items[j]);
        items.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return items;
}

function readingGap(a, b) {
  const vertical = a.direction === "vertical" || b.direction === "vertical";
  if (vertical) {
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const minW = Math.min(a.width, b.width);
    if (minW <= 0 || overlapX / minW < 0.35) return Infinity;
    return Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  }
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const minH = Math.min(a.height, b.height);
  if (minH <= 0 || overlapY / minH < 0.35) return Infinity;
  return Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
}

function shouldMergeShort(a, b) {
  const aLen = compactLen(a.original);
  const bLen = compactLen(b.original);
  if (aLen >= 3 && bLen >= 3) return false;
  if (Math.max(aLen, bLen) >= 8) return false;
  return readingGap(a, b) <= 0.045;
}
