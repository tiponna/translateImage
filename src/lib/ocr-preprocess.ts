import sharp, { type Sharp } from "sharp";

export type OcrVariant = {
  name: string;
  buffer: Buffer;
};

/**
 * เตรียมรูปหลายแบบก่อน OCR — เหมาะกับหนังสือการ์ตูน
 * (ฟองคำพูด, ตัวอักษรเล็ก, screentone, ตัวขาวบนพื้นดำ)
 */
export async function preprocessVariants(
  input: Buffer,
  mode: "comic" | "document" = "comic",
): Promise<OcrVariant[]> {
  const base = sharp(input, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  // การ์ตูน: ขยายด้านสั้น ≥ 2200px เพื่อจับตัวอักษรในฟองคำพูด
  const targetMin = mode === "comic" ? 2200 : 1600;
  const maxSide = 4500;
  const minSide = Math.min(width || targetMin, height || targetMin);

  let scale = 1;
  if (minSide > 0 && minSide < targetMin) {
    scale = targetMin / minSide;
  } else if (Math.max(width, height) > maxSide) {
    scale = maxSide / Math.max(width, height);
  }

  const resizedW = Math.max(1, Math.round((width || targetMin) * scale));
  const resizedH = Math.max(1, Math.round((height || targetMin) * scale));

  async function pipeline(
    name: string,
    transform: (img: Sharp) => Sharp,
  ): Promise<OcrVariant> {
    let img = sharp(input, { failOn: "none" }).rotate();
    if (scale !== 1) {
      img = img.resize({
        width: resizedW,
        height: resizedH,
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      });
    }
    const buffer = await transform(img)
      .png({ compressionLevel: 6 })
      .toBuffer();
    return { name, buffer };
  }

  if (mode === "document") {
    const doc = await pipeline("document", (img) =>
      img
        .grayscale()
        .normalize()
        .linear(1.15, -8)
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 0.4 }),
    );
    return [doc];
  }

  // --- comic variants ---
  // 1) contrast สูง + ลด noise จาก screentone
  const contrast = await pipeline("comic-contrast", (img) =>
    img
      .grayscale()
      .median(3) // ลดจุด halftone / screentone
      .normalize()
      .linear(1.35, -18)
      .sharpen({ sigma: 1.4, m1: 1.2, m2: 0.6 }),
  );

  // 2) binary threshold — ตัวอักษรดำบนพื้นขาวชัดขึ้น
  const binary = await pipeline("comic-binary", (img) =>
    img
      .grayscale()
      .median(3)
      .normalize()
      .linear(1.4, -25)
      .threshold(145)
      .sharpen({ sigma: 0.8 }),
  );

  // 3) invert — ตัวอักษรขาวบนพื้นดำ / SFX
  const inverted = await pipeline("comic-invert", (img) =>
    img
      .grayscale()
      .median(3)
      .normalize()
      .negate()
      .linear(1.3, -12)
      .sharpen({ sigma: 1.2, m1: 1.0, m2: 0.5 }),
  );

  return [contrast, binary, inverted];
}

/** คะแนนคุณภาพข้อความ OCR (ยิ่งสูงยิ่งดี) */
export function scoreOcrText(text: string, confidence: number): number {
  const cleaned = text
    .replace(/[^\p{L}\p{N}\p{M}\s.,!?'"…—\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return 0;

  const letters = (cleaned.match(/\p{L}/gu) || []).length;
  const ratio = letters / Math.max(1, cleaned.length);
  // confidence 0–100, ความยาวตัวอักษร, สัดส่วนตัวอักษรจริง
  return confidence * 0.55 + Math.min(cleaned.length, 800) * 0.08 + ratio * 40;
}

export function cleanupOcrText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
