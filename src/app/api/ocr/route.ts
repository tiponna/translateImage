import { NextRequest, NextResponse } from "next/server";
import { createWorker, PSM, type Worker } from "tesseract.js";
import sharp from "sharp";
import {
  cleanupOcrText,
  preprocessVariants,
  scoreOcrText,
} from "@/lib/ocr-preprocess";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);
const HF_BUBBLE_MODEL = "ogkalu/comic-speech-bubble-detector-yolov8m";
const HF_BUBBLE_API = `https://api-inference.huggingface.co/models/${HF_BUBBLE_MODEL}`;
const MAX_BUBBLE_CROPS = 8;

type BubbleBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

async function bufferFromUrl(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ImageTranslator/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`ดึงรูปจาก URL ไม่สำเร็จ (${res.status})`);
  }
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!ALLOWED.has(mime) && !mime.startsWith("image/")) {
    throw new Error("URL นี้ไม่ใช่ไฟล์รูปภาพที่รองรับ");
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) {
    throw new Error("ไฟล์ใหญ่เกิน 10MB");
  }
  return { buffer: Buffer.from(ab), mime };
}

function resolveLang(langHint?: string): string {
  if (!langHint || langHint === "auto") return "eng+tha";
  switch (langHint) {
    case "th":
      return "tha+eng";
    case "zh":
      return "chi_sim+eng";
    case "ja":
      return "jpn+eng";
    case "ko":
      return "kor+eng";
    case "vi":
      return "vie+eng";
    case "en":
      return "eng";
    default:
      return "eng+tha";
  }
}

type PassResult = {
  text: string;
  confidence: number;
  score: number;
  variant: string;
  psm: string;
};

async function recognizePass(
  worker: Worker,
  buffer: Buffer,
  psm: PSM,
  variant: string,
): Promise<PassResult> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
    // ลด noise จากสัญลักษณ์แปลก ๆ ในงานศิลป์การ์ตูน
    tessedit_char_blacklist: "|¦[]{}§©®™<>",
  });

  const { data } = await worker.recognize(buffer);
  const text = cleanupOcrText(data.text || "");
  const confidence = typeof data.confidence === "number" ? data.confidence : 0;
  return {
    text,
    confidence,
    score: scoreOcrText(text, confidence),
    variant,
    psm: String(psm),
  };
}

function mergeNearbyBubbles(boxes: BubbleBox[]): BubbleBox[] {
  const merged: BubbleBox[] = [];
  for (const box of boxes) {
    const target = merged.find((m) => {
      const overlapX = Math.max(0, Math.min(m.x + m.width, box.x + box.width) - Math.max(m.x, box.x));
      const overlapY = Math.max(
        0,
        Math.min(m.y + m.height, box.y + box.height) - Math.max(m.y, box.y),
      );
      const overlapArea = overlapX * overlapY;
      const minArea = Math.min(m.width * m.height, box.width * box.height);
      return minArea > 0 && overlapArea / minArea > 0.35;
    });
    if (!target) {
      merged.push(box);
      continue;
    }
    const minX = Math.min(target.x, box.x);
    const minY = Math.min(target.y, box.y);
    const maxX = Math.max(target.x + target.width, box.x + box.width);
    const maxY = Math.max(target.y + target.height, box.y + box.height);
    target.x = minX;
    target.y = minY;
    target.width = maxX - minX;
    target.height = maxY - minY;
    target.score = Math.max(target.score, box.score);
  }
  return merged;
}

function parseHfBoxes(raw: unknown, imageW: number, imageH: number): BubbleBox[] {
  if (!Array.isArray(raw)) return [];
  const parsed: BubbleBox[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const score = Number((item as { score?: number }).score ?? 0);
    const box = (item as { box?: { xmin?: number; ymin?: number; xmax?: number; ymax?: number } })
      .box;
    if (!box) continue;
    const xmin = Math.max(0, Math.floor(Number(box.xmin ?? 0)));
    const ymin = Math.max(0, Math.floor(Number(box.ymin ?? 0)));
    const xmax = Math.min(imageW, Math.ceil(Number(box.xmax ?? 0)));
    const ymax = Math.min(imageH, Math.ceil(Number(box.ymax ?? 0)));
    const width = xmax - xmin;
    const height = ymax - ymin;
    if (score < 0.2 || width < 24 || height < 24) continue;
    parsed.push({ x: xmin, y: ymin, width, height, score });
  }

  const merged = mergeNearbyBubbles(parsed);
  return merged
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, MAX_BUBBLE_CROPS);
}

async function detectSpeechBubbles(buffer: Buffer): Promise<BubbleBox[]> {
  const apiKey = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return [];

  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  const imageW = meta.width || 0;
  const imageH = meta.height || 0;
  if (!imageW || !imageH) return [];

  const res = await fetch(HF_BUBBLE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/octet-stream",
    },
    body: buffer,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn("[ocr] bubble detector unavailable", res.status, body.slice(0, 120));
    return [];
  }

  const json = (await res.json()) as unknown;
  return parseHfBoxes(json, imageW, imageH);
}

async function cropBubbleRegions(buffer: Buffer, boxes: BubbleBox[]): Promise<Buffer[]> {
  if (!boxes.length) return [];
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const maxW = meta.width || 0;
  const maxH = meta.height || 0;
  if (!maxW || !maxH) return [];

  const crops: Buffer[] = [];
  for (const box of boxes) {
    const padX = Math.round(box.width * 0.08);
    const padY = Math.round(box.height * 0.12);
    const left = Math.max(0, box.x - padX);
    const top = Math.max(0, box.y - padY);
    const right = Math.min(maxW, box.x + box.width + padX);
    const bottom = Math.min(maxH, box.y + box.height + padY);
    const width = right - left;
    const height = bottom - top;
    if (width < 24 || height < 24) continue;

    const crop = await image
      .clone()
      .extract({ left, top, width, height })
      .png({ compressionLevel: 6 })
      .toBuffer();
    crops.push(crop);
  }
  return crops;
}

async function combineCrops(crops: Buffer[]): Promise<Buffer | null> {
  if (!crops.length) return null;
  const metas = await Promise.all(crops.map((c) => sharp(c).metadata()));
  const widths = metas.map((m) => m.width || 0).filter(Boolean);
  const heights = metas.map((m) => m.height || 0).filter(Boolean);
  if (!widths.length || !heights.length) return null;

  const gap = 24;
  const canvasW = Math.max(...widths);
  const canvasH = heights.reduce((sum, h) => sum + h, 0) + gap * (crops.length - 1);

  let y = 0;
  const composites = crops.map((input, idx) => {
    const h = heights[idx] || 0;
    const entry = { input, top: y, left: 0 };
    y += h + gap;
    return entry;
  });

  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * การ์ตูน: PSM.SPARSE_TEXT (ฟองคำพูดกระจาย) + PSM.AUTO
 * เอกสาร: PSM.SINGLE_BLOCK
 */
async function runOcr(
  buffer: Buffer,
  langHint?: string,
  mode: "comic" | "document" = "comic",
): Promise<{ text: string; meta?: { variant: string; psm: string; confidence: number } }> {
  const lang = resolveLang(langHint);
  const variants = await preprocessVariants(buffer, mode);
  const worker = await createWorker(lang);

  try {
    const passes: PassResult[] = [];
    const psms: PSM[] =
      mode === "comic" ? [PSM.SPARSE_TEXT, PSM.AUTO] : [PSM.SINGLE_BLOCK];

    for (const variant of variants) {
      for (const psm of psms) {
        try {
          const result = await recognizePass(worker, variant.buffer, psm, variant.name);
          if (result.text) passes.push(result);
        } catch (e) {
          console.warn(`[ocr] pass failed ${variant.name}/psm${psm}`, e);
        }
      }
    }

    if (!passes.length) {
      return { text: "" };
    }

    passes.sort((a, b) => b.score - a.score);
    const best = passes[0];

    // รวมข้อความจาก pass ที่ดีใกล้เคียง ถ้า best สั้นมาก (ฟองคำพูดบางอันหาย)
    let finalText = best.text;
    if (mode === "comic" && best.text.length < 40) {
      const extras = passes
        .slice(1, 4)
        .filter((p) => p.score > best.score * 0.7 && p.text.length > 8)
        .map((p) => p.text);
      if (extras.length) {
        const merged = [best.text, ...extras]
          .join("\n")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        finalText = cleanupOcrText([...new Set(merged)].join("\n"));
      }
    }

    return {
      text: finalText,
      meta: {
        variant: best.variant,
        psm: best.psm,
        confidence: Math.round(best.confidence),
      },
    };
  } finally {
    await worker.terminate();
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer;
    let sourceLang = "auto";
    let mode: "comic" | "document" = "comic";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      sourceLang = String(form.get("sourceLang") || "auto");
      const modeRaw = String(form.get("ocrMode") || "comic");
      mode = modeRaw === "document" ? "document" : "comic";
      const imageUrl = form.get("imageUrl");

      if (file && file instanceof File) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });
        }
        if (file.type && !ALLOWED.has(file.type) && !file.type.startsWith("image/")) {
          return NextResponse.json({ error: "รองรับเฉพาะ JPG, PNG, WEBP" }, { status: 400 });
        }
        buffer = Buffer.from(await file.arrayBuffer());
      } else if (typeof imageUrl === "string" && imageUrl.trim()) {
        const fetched = await bufferFromUrl(imageUrl.trim());
        buffer = fetched.buffer;
      } else {
        return NextResponse.json({ error: "กรุณาอัปโหลดรูปหรือใส่ URL" }, { status: 400 });
      }
    } else {
      const body = await req.json();
      sourceLang = body.sourceLang || "auto";
      mode = body.ocrMode === "document" ? "document" : "comic";
      if (body.imageUrl) {
        const fetched = await bufferFromUrl(String(body.imageUrl));
        buffer = fetched.buffer;
      } else if (body.imageBase64) {
        const raw = String(body.imageBase64).replace(/^data:image\/\w+;base64,/, "");
        buffer = Buffer.from(raw, "base64");
        if (buffer.byteLength > MAX_BYTES) {
          return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "กรุณาอัปโหลดรูปหรือใส่ URL" }, { status: 400 });
      }
    }

    let ocrBuffer = buffer;
    let bubblesUsed = 0;
    const bubbleDetectorEnabled =
      mode === "comic" && Boolean(process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY);

    if (bubbleDetectorEnabled) {
      try {
        const boxes = await detectSpeechBubbles(buffer);
        if (boxes.length) {
          const crops = await cropBubbleRegions(buffer, boxes);
          if (crops.length) {
            const combined = await combineCrops(crops);
            if (combined) {
              bubblesUsed = crops.length;
              ocrBuffer = combined;
            }
          }
        }
      } catch (e) {
        console.warn("[ocr] speech bubble detect failed, fallback to full image", e);
      }
    }

    const { text, meta } = await runOcr(ocrBuffer, sourceLang, mode);
    if (!text) {
      return NextResponse.json(
        { error: "ไม่พบข้อความในรูปภาพ", text: "" },
        { status: 200 },
      );
    }

    return NextResponse.json({
      text,
      meta: {
        ...meta,
        bubbleDetector: {
          model: HF_BUBBLE_MODEL,
          usedBubbles: bubblesUsed,
          enabled: bubbleDetectorEnabled,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR ล้มเหลว";
    console.error("[ocr]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
