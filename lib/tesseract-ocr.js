import { cropForOcr, enhanceForOcr, looksLikeManga } from "@/lib/ocr-preprocess";

const LANGS = {
  auto: "jpn+eng+chi_sim",
  ja: "jpn",
  ko: "jpn+eng+chi_sim",
  en: "eng",
  zh: "chi_sim",
};

let worker = null;
let workerLangs = "";

export function tesseractLangsFor(sourceLanguage) {
  return LANGS[sourceLanguage] || LANGS.auto;
}

export function tesseractNeedsLanguageDownload(sourceLanguage) {
  return workerLangs !== tesseractLangsFor(sourceLanguage);
}

export async function recognizeWithTesseract(dataUrl, sourceLanguage, onProgress, { force = false } = {}) {
  if (!force && (await looksLikeManga(dataUrl))) {
    if (onProgress) onProgress(1, "manga");
    return {
      kind: "manga",
      detectedLanguageCode: sourceLanguage === "auto" ? "ja" : sourceLanguage,
      detectedLanguageName:
        sourceLanguage === "en" ? "English" : sourceLanguage === "zh" ? "中文" : "日本語",
      hasText: false,
      originalText: "",
      notes:
        "หน้านี้เป็นมังงะ (ฟองพูด / ตัวแนวตั้ง / เสียงประกอบ) Tesseract อ่านไม่ได้ — ใช้ Gemini ทั้งหน้า",
      blocks: [],
      needsGemini: true,
      loadedLangs: "",
      loadedFirstTime: false,
    };
  }

  const langs = tesseractLangsFor(sourceLanguage);
  const loadingLangs = workerLangs !== langs;
  const tess = await getWorker(langs, (ratio, status) => {
    if (!onProgress) return;
    if (loadingLangs) onProgress(ratio * 0.4, status);
    else onProgress(0.12 + ratio * 0.2, "ocr");
  });

  const passes = [
    { name: "original", image: dataUrl, binary: false, invert: false },
    { name: "contrast", prepare: () => enhanceForOcr(dataUrl, 1600, { binary: false }) },
    { name: "binary", prepare: () => enhanceForOcr(dataUrl, 1600, { binary: true }) },
    { name: "invert", prepare: () => enhanceForOcr(dataUrl, 1600, { binary: true, invert: true }) },
  ];

  let draft = [];
  for (let i = 0; i < passes.length; i += 1) {
    const pass = passes[i];
    if (onProgress) onProgress(0.42 + i * 0.08, "detect");
    const prepared = pass.prepare
      ? await pass.prepare()
      : { dataUrl: pass.image, width: 0, height: 0 };
    if (!prepared.width) {
      const size = await imageSize(prepared.dataUrl);
      prepared.width = size.width;
      prepared.height = size.height;
    }
    draft = await detectPass(tess, prepared);
    if (draft.length) break;
  }

  const refined = [];
  const limit = Math.min(draft.length, 40);
  for (let i = 0; i < limit; i += 1) {
    if (onProgress) onProgress(0.72 + (i / Math.max(limit, 1)) * 0.26, "crop");
    const line = draft[i];
    try {
      const crop = await cropForOcr(dataUrl, line, { binary: false });
      await tess.setParameters({
        tessedit_pageseg_mode: line.direction === "vertical" ? "5" : "7",
      });
      const again = await tess.recognize(crop, {}, { text: true, blocks: true });
      const cropLines = extractLines(again.data, 1, 1);
      refined.push(pickBetter(line, cropLines[0], again.data?.text, again.data?.confidence));
    } catch {
      refined.push(line);
    }
  }

  const detectedLang = detectFromLines(refined, sourceLanguage);
  return {
    kind: guessKind(refined),
    detectedLanguageCode: detectedLang.code,
    detectedLanguageName: detectedLang.name,
    hasText: refined.some((line) => line.original),
    originalText: refined.map((line) => line.original).join("\n"),
    notes:
      "ใช้ Tesseract ในเบราว์เซอร์ จึงไม่กินโควต้า Gemini — เหมาะกับป้ายพิมพ์ชัด เมนู เอกสาร",
    blocks: refined,
    loadedLangs: langs,
    loadedFirstTime: loadingLangs,
  };
}

async function detectPass(tess, prepared) {
  await tess.setParameters({ tessedit_pageseg_mode: "3" });
  let result = await tess.recognize(prepared.dataUrl, {}, { blocks: true, text: true });
  let lines = extractLines(result.data, prepared.width, prepared.height);
  if (lines.length) return lines;

  await tess.setParameters({ tessedit_pageseg_mode: "11" });
  result = await tess.recognize(prepared.dataUrl, {}, { blocks: true, text: true });
  return extractLines(result.data, prepared.width, prepared.height);
}

async function getWorker(langs, onProgress) {
  const { createWorker } = await import("tesseract.js");
  if (worker && workerLangs === langs) return worker;
  if (worker) {
    await worker.terminate();
    worker = null;
    workerLangs = "";
  }

  worker = await createWorker(langs, 1, {
    logger(message) {
      if (!onProgress) return;
      if (message.status === "loading language traineddata") {
        onProgress(Math.min(0.7, message.progress * 0.7), "lang");
      } else if (message.status === "initializing api") {
        onProgress(0.82, "lang");
      } else if (message.status === "recognizing text") {
        onProgress(0.85 + message.progress * 0.15, "ocr");
      }
    },
  });
  workerLangs = langs;
  return worker;
}

function extractLines(page, imageWidth, imageHeight) {
  const collected = [];
  const seen = new Set();

  function add(text, confidence, bbox) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const box = normalizeBox(bbox, imageWidth, imageHeight) || {
      x: 0.04,
      y: Math.min(0.9, collected.length * 0.06),
      width: 0.92,
      height: 0.05,
    };
    const key = `${clean}|${box.x.toFixed(3)}|${box.y.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push(buildBlock(clean, Number(confidence) || 0, box));
  }

  for (const block of page?.blocks || page?.layoutBlocks || []) {
    const paragraphs = block.paragraphs || block.para || [];
    if (!paragraphs.length) {
      add(block.text, block.confidence, readBbox(block));
      continue;
    }
    for (const paragraph of paragraphs) {
      const lines = paragraph.lines || [];
      if (!lines.length) {
        add(paragraph.text, paragraph.confidence, readBbox(paragraph) || readBbox(block));
        continue;
      }
      for (const line of lines) {
        add(line.text, line.confidence, readBbox(line));
        if (!line.text && line.words?.length) {
          add(
            line.words.map((word) => word.text).join(" "),
            line.confidence,
            readBbox(line),
          );
        }
      }
    }
  }

  if (!collected.length && String(page?.text || "").trim()) {
    String(page.text)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        add(line, page.confidence, {
          x0: 0,
          y0: index * 20,
          x1: imageWidth || 100,
          y1: (index + 1) * 20,
        });
      });
  }

  return collected;
}

function readBbox(item) {
  if (!item) return null;
  const box = item.bbox || item.box || item.bounding_box;
  if (!box) return null;
  if (Array.isArray(box) && box.length >= 4) {
    return { x0: box[0], y0: box[1], x1: box[2], y1: box[3] };
  }
  if (box.x0 != null && box.x1 != null) return box;
  return null;
}

function buildBlock(text, confidence, box) {
  const unclear = isUnclear(text, confidence);
  return {
    original: text,
    translation: "",
    confidence,
    unclear,
    source: "tesseract",
    ...box,
    direction: box.height > box.width * 1.35 ? "vertical" : "horizontal",
    background: "light",
    shape: "box",
  };
}

export function isUnclear(text, confidence) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  if ((confidence || 0) > 0 && confidence < 35) return true;
  const compact = trimmed.replace(/\s+/g, "");
  if (compact.length < 1) return true;
  if (/^(.)\1{5,}$/.test(compact)) return true;
  return false;
}

function pickBetter(original, cropped, pageText, pageConfidence) {
  const cropText = cropped?.original || String(pageText || "").replace(/\s+/g, " ").trim();
  const cropConf = cropped?.confidence || Number(pageConfidence) || 0;
  if (!cropText) return original;
  const cropBlock = buildBlock(cropText, cropConf, {
    x: original.x,
    y: original.y,
    width: original.width,
    height: original.height,
  });
  cropBlock.direction = original.direction;
  if (cropBlock.unclear && !original.unclear) return original;
  if (!cropBlock.unclear && original.unclear) return cropBlock;
  return cropConf >= (original.confidence || 0) ? cropBlock : original;
}

function normalizeBox(bbox, imageWidth, imageHeight) {
  const box = readBbox({ bbox }) || bbox;
  if (!box || !imageWidth || !imageHeight) return null;
  const x0 = Number(box.x0);
  const y0 = Number(box.y0);
  const x1 = Number(box.x1);
  const y1 = Number(box.y1);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  const width = (x1 - x0) / imageWidth;
  const height = (y1 - y0) / imageHeight;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, x0 / imageWidth),
    y: Math.max(0, y0 / imageHeight),
    width: Math.min(1, Math.max(0.01, width)),
    height: Math.min(1, Math.max(0.01, height)),
  };
}

function guessKind(lines) {
  if (!lines.length) return "other";
  const vertical = lines.filter((line) => line.direction === "vertical").length;
  if (vertical >= Math.max(2, lines.length * 0.4)) return "manga";
  return "sign";
}

function detectFromLines(lines, sourceLanguage) {
  if (sourceLanguage === "ja") return { code: "ja", name: "日本語" };
  if (sourceLanguage === "ko") return { code: "ko", name: "한국어" };
  if (sourceLanguage === "en") return { code: "en", name: "English" };
  if (sourceLanguage === "zh") return { code: "zh", name: "中文" };
  const text = lines.map((line) => line.original).join("");
  if (/[\u3040-\u30ff]/.test(text)) return { code: "ja", name: "日本語" };
  if (/[\uac00-\ud7af]/.test(text)) return { code: "ko", name: "한국어" };
  if (/[\u3400-\u9fff]/.test(text)) return { code: "zh", name: "中文" };
  return { code: "en", name: "English" };
}

function imageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("เปิดรูปสำหรับ Tesseract ไม่สำเร็จ"));
    image.src = dataUrl;
  });
}
