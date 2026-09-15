"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SOURCE_LANGUAGES, isCjkSource, textLooksCjk } from "@/lib/languages";
import {
  clearHistory,
  deleteHistoryItem,
  loadHistory,
  upsertHistoryItem,
} from "@/lib/history-storage";
import {
  fingerprintImage,
  geminiCacheKey,
  getGeminiCache,
  setGeminiCache,
} from "@/lib/gemini-cache";
import {
  GEMINI_RPD,
  canUseGemini,
  readGeminiQuota,
  recordGeminiUse,
} from "@/lib/gemini-quota";
import { cropAndBinarize, looksLikeManga } from "@/lib/ocr-preprocess";
import { translateLinesToThai } from "@/lib/free-translate";
import { renderThaiOverlay } from "@/lib/overlay-text";
import { prepareImageFile, prepareImageFromDataUrl } from "@/lib/prepare-image";
import {
  recognizeWithTesseract,
  tesseractNeedsLanguageDownload,
} from "@/lib/tesseract-ocr";

const ENGINE_KEY = "phap-plae-engine-v2";
const SOURCE_ENGINE_KEY = "phap-plae-engine-by-source";
const ENGINES = ["auto", "tesseract", "gemini"];
const UNTRANSLATED_NOTE =
  "โควต้า Gemini เต็มแล้ว — แสดงต้นฉบับ OCR ยังไม่แปล (ไม่ส่งมังงะเข้าบริการแปลคำต่อคำ)";

export default function Translator() {
  const fileInputId = useId();
  const cameraInputId = useId();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [preview, setPreview] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [fileName, setFileName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [engine, setEngine] = useState("auto");
  const [quota, setQuota] = useState({ used: 0, remaining: GEMINI_RPD });
  const [busyBlock, setBusyBlock] = useState(-1);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState("");
  const [view, setView] = useState("overlay");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxItem, setLightboxItem] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [progress, setProgress] = useState({ percent: 0, label: "" });
  const [history, setHistory] = useState([]);
  const overlayToken = useRef(0);
  const paintTimer = useRef(null);
  const historyMetaRef = useRef({ id: null, createdAt: null });

  const applyPrepared = useCallback((prepared) => {
    setPreview(prepared.dataUrl);
    setFileName(prepared.name);
    setOverlay(null);
    setResult(null);
    setError("");
    setView("original");
    const saved = readSourceEngines()[fingerprintImage(prepared.dataUrl)];
    if (ENGINES.includes(saved)) setEngine(saved);
  }, []);

  const loadFile = useCallback(
    async (file) => {
      if (!file) return;
      setError("");
      try {
        applyPrepared(await prepareImageFile(file));
      } catch (err) {
        setPreview(null);
        setFileName("");
        setError(err.message || "เปิดรูปไม่สำเร็จ");
      }
    },
    [applyPrepared],
  );

  const loadFromUrl = useCallback(
    async (url) => {
      const trimmed = url.trim();
      if (!trimmed) {
        setError("วาง URL รูปภาพก่อน");
        return null;
      }
      setBusy("fetch");
      setProgress({ percent: 10, label: "กำลังโหลดรูปจาก URL" });
      setError("");
      try {
        const response = await fetch("/api/fetch-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: trimmed }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "ดึงรูปจาก URL ไม่สำเร็จ");
        const prepared = await prepareImageFromDataUrl(data.dataUrl, trimmed.split("/").pop() || "url.jpg");
        applyPrepared(prepared);
        return prepared.dataUrl;
      } catch (err) {
        setError(err.message || "ดึงรูปจาก URL ไม่สำเร็จ");
        return null;
      } finally {
        setBusy("");
        setProgress({ percent: 0, label: "" });
      }
    },
    [applyPrepared],
  );

  useEffect(() => {
    const items = loadHistory();
    const savedEngine = window.localStorage.getItem(ENGINE_KEY);
    const quotaNow = readGeminiQuota();
    const frame = window.requestAnimationFrame(() => {
      setHistory(items);
      setQuota(quotaNow);
      if (ENGINES.includes(savedEngine)) setEngine(savedEngine);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (busy !== "translate" && busy !== "fetch") return undefined;
    if (busy === "translate" && engine !== "gemini") return undefined;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const cap = busy === "fetch" ? 68 : 74;
        if (current.percent >= cap) return current;
        const bump = Math.max(0.35, (cap - current.percent) * 0.035);
        const percent = Math.min(cap, current.percent + bump);
        const label =
          busy === "fetch"
            ? "กำลังโหลดรูปจาก URL"
            : percent < 18
              ? "เตรียมรูป"
              : "ตรวจจับข้อความแล้วแปลเป็นไทย";
        return { percent, label };
      });
    }, 180);
    return () => window.clearInterval(timer);
  }, [busy, engine]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    function onKey(event) {
      if (event.key === "Escape") closeLarge();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [lightboxOpen]);

  useEffect(() => {
    function onPaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          event.preventDefault();
          loadFile(item.getAsFile());
          return;
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  async function paintOverlay(image, blocks) {
    const token = overlayToken.current + 1;
    overlayToken.current = token;
    if (!image || !blocks?.length) {
      setOverlay(null);
      return;
    }
    try {
      const url = await renderThaiOverlay(image, blocks);
      if (overlayToken.current === token) {
        setOverlay(url);
        return url;
      }
    } catch (err) {
      if (overlayToken.current === token) {
        setError(err.message || "วาดข้อความไทยบนรูปไม่สำเร็จ");
      }
    }
    return null;
  }

  async function onTranslate() {
    let image = preview;
    if (!image && imageUrl.trim()) {
      image = await loadFromUrl(imageUrl);
    }
    if (!image) {
      setError("อัปโหลดรูป หรือวาง URL รูปภาพก่อน");
      return;
    }

    setBusy("translate");
    setProgress({ percent: 8, label: "เตรียมรูป" });
    setError("");
    setResult(null);
    setOverlay(null);
    try {
      const mangaLook = await looksLikeManga(image);
      const cjk = isCjkSource(sourceLanguage);
      const mangaPage = mangaLook || cjk;
      let data;

      if (engine === "gemini" || mangaPage) {
        const gate = canUseGemini();
        if (gate.ok) {
          setProgress({
            percent: 20,
            label: mangaPage ? "มังงะ/CJK — ส่ง Gemini ทั้งหน้า 1 ครั้ง" : "ส่ง Gemini ทั้งหน้า",
          });
          data = await runGeminiJob(image, {
            difficulty: "hard",
            pageKind: mangaPage ? "manga" : "",
          });
        } else if (engine === "gemini" && !mangaPage) {
          throw new Error(
            gate.reason === "rpm"
              ? "Gemini เกิน 5 ครั้งต่อนาที รอสักครู่"
              : "Gemini วันนี้ครบ 20 ครั้งแล้ว",
          );
        } else {
          setProgress({ percent: 24, label: "โควต้า Gemini หมด — อ่านต้นฉบับ OCR" });
          data = await runTesseractJob(image, { translate: false, force: true });
          data = untranslatedFromOcr(data, UNTRANSLATED_NOTE);
        }
      } else {
        data = await runTesseractJob(image);
        const mustGemini =
          data.kind === "manga" ||
          data.needsGemini ||
          isCjkSource(data.detectedLanguageCode) ||
          textLooksCjk(data.originalText) ||
          tesseractIsPoor(data);
        if (mustGemini) {
          const gate = canUseGemini();
          if (gate.ok) {
            setProgress({ percent: 76, label: "Tesseract อ่านไม่ชัด — ส่ง Gemini ทั้งหน้า 1 ครั้ง" });
            data = await runGeminiJob(image, {
              difficulty: "hard",
              pageKind:
                data.kind === "manga" || isCjkSource(data.detectedLanguageCode) ? "manga" : "",
            });
          } else if (
            data.kind === "manga" ||
            data.needsGemini ||
            isCjkSource(data.detectedLanguageCode)
          ) {
            data = untranslatedFromOcr(data, UNTRANSLATED_NOTE);
          }
        }
      }
      await completeTranslation(image, data);
    } catch (err) {
      setError(err.message || "แปลไม่สำเร็จ");
      setProgress({ percent: 0, label: "" });
    } finally {
      setBusy("");
    }
  }

  async function completeTranslation(image, data) {
    setResult(data);
    setView("overlay");
    setProgress({ percent: 82, label: "วางภาษาไทยทับรูป" });
    const overlayUrl = await paintOverlay(image, paintableBlocks(data.blocks));
    setProgress({ percent: 92, label: "บันทึกประวัติ" });
    const id = crypto.randomUUID();
    historyMetaRef.current = { id, createdAt: null };
    const items = await upsertHistoryItem({
      id,
      fileName: fileName || imageUrl.split("/").pop() || "image.jpg",
      sourceLanguage,
      engine,
      result: data,
      original: image,
      overlay: overlayUrl || "",
    });
    historyMetaRef.current = { id, createdAt: items[0]?.createdAt || null };
    setHistory(items);
    setProgress({ percent: 100, label: "เสร็จแล้ว" });
    window.setTimeout(() => {
      setProgress((current) =>
        current.percent >= 100 ? { percent: 0, label: "" } : current,
      );
    }, 1400);
  }

  async function geminiWholePage() {
    if (!preview) return;
    setBusy("translate");
    setProgress({ percent: 12, label: "ส่งทั้งหน้าให้ Gemini" });
    setError("");
    try {
      const data = await runGeminiJob(preview, { difficulty: "hard", pageKind: "manga" });
      await completeTranslation(preview, data);
    } catch (err) {
      setError(err.message || "ส่ง Gemini ทั้งหน้าไม่สำเร็จ");
      setProgress({ percent: 0, label: "" });
    } finally {
      setBusy("");
    }
  }

  async function runGeminiJob(image, { region = false, difficulty = "hard", pageKind = "" } = {}) {
    const gate = canUseGemini();
    if (!gate.ok) {
      throw new Error(
        gate.reason === "rpm"
          ? "Gemini เกิน 5 ครั้งต่อนาที รอสักครู่"
          : "Gemini วันนี้ครบ 20 ครั้งแล้ว",
      );
    }
    const kind = pageKind || ((await looksLikeManga(image)) ? "manga" : "");
    const cacheKey = geminiCacheKey({ image, sourceLanguage, difficulty, region, pageKind: kind });
    const cached = getGeminiCache(cacheKey);
    if (cached) return { ...cached, fromCache: true };
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        sourceLanguage,
        region,
        difficulty,
        pageKind: kind,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "แปลไม่สำเร็จ");
    setQuota(recordGeminiUse());
    setGeminiCache(cacheKey, data);
    return data;
  }

  async function runTesseractJob(image, { translate = true, force = false } = {}) {
    const firstLoad = tesseractNeedsLanguageDownload(sourceLanguage);
    setProgress({
      percent: 6,
      label: firstLoad ? "กำลังโหลดไฟล์ภาษา (ครั้งเดียว)" : "OCR ในเบราว์เซอร์ — ไม่กินโควต้า",
    });
    const ocr = await recognizeWithTesseract(
      image,
      sourceLanguage,
      (ratio, status) => {
        const label =
          status === "lang" || firstLoad
            ? "กำลังโหลดไฟล์ภาษา (ครั้งเดียว)"
            : status === "crop"
              ? "ครอปเฉพาะข้อความแล้วอ่าน"
              : "OCR ในเบราว์เซอร์ — ไม่กินโควต้า";
        setProgress({ percent: 6 + ratio * 64, label });
      },
      { force },
    );
    const skipTranslate =
      !translate ||
      ocr.kind === "manga" ||
      ocr.needsGemini ||
      isCjkSource(sourceLanguage) ||
      isCjkSource(ocr.detectedLanguageCode) ||
      textLooksCjk(ocr.originalText);
    if (skipTranslate) {
      const blocks = ocr.blocks.map((block) => ({ ...block, translation: "" }));
      return {
        kind: ocr.kind,
        detectedLanguageCode: ocr.detectedLanguageCode,
        detectedLanguageName: ocr.detectedLanguageName,
        hasText: Boolean(ocr.hasText || blocks.some((block) => block.original)),
        originalText: blocks.map((block) => block.original).filter(Boolean).join("\n\n"),
        translation: "",
        notes: ocr.notes,
        blocks,
        provider: "tesseract",
        providerLabel: "Tesseract ในเบราว์เซอร์ — ไม่กินโควต้า",
        targetLanguage: "th",
        targetLanguageName: "ไทย",
        needsGemini: Boolean(ocr.needsGemini || ocr.kind === "manga"),
      };
    }
    const clearTexts = [];
    const clearIndexes = [];
    ocr.blocks.forEach((block, index) => {
      if (!block.unclear && block.original) {
        clearIndexes.push(index);
        clearTexts.push(block.original);
      }
    });
    setProgress({ percent: 74, label: "แปลป้ายพิมพ์ทั้งก้อน — ไม่กินโควต้า 3.6 Flash" });
    const translations = clearTexts.length
      ? await translateLinesToThai(clearTexts, sourceLanguage)
      : [];
    const blocks = ocr.blocks.map((block, index) => {
      const slot = clearIndexes.indexOf(index);
      if (slot === -1) return { ...block, translation: "" };
      return {
        ...block,
        translation: translations[slot] || block.original,
        unclear: false,
      };
    });
    return {
      kind: ocr.kind,
      detectedLanguageCode: ocr.detectedLanguageCode,
      detectedLanguageName: ocr.detectedLanguageName,
      hasText: Boolean(ocr.hasText || blocks.some((block) => block.original)),
      originalText: blocks.map((block) => block.original).filter(Boolean).join("\n\n"),
      translation: blocks
        .filter((block) => block.translation)
        .map((block) => block.translation)
        .join("\n\n"),
      notes: ocr.notes,
      blocks,
      provider: "tesseract",
      providerLabel: "Tesseract ในเบราว์เซอร์ — ไม่กินโควต้า",
      targetLanguage: "th",
      targetLanguageName: "ไทย",
      needsGemini: Boolean(ocr.needsGemini),
    };
  }

  async function geminiForBlock(index) {
    if (!preview || !result?.blocks?.[index]) return;
    setBusy("block");
    setBusyBlock(index);
    setError("");
    try {
      const block = result.blocks[index];
      const crop = await cropAndBinarize(preview, block);
      const data = await runGeminiJob(crop, {
        region: true,
        difficulty: "easy",
        pageKind: result.kind === "manga" ? "manga" : "",
      });
      const generated = data.blocks?.[0];
      const blocks = result.blocks.map((item, i) => {
        if (i !== index) return item;
        if (!generated) return { ...item, unclear: true };
        return {
          ...item,
          original: generated.original || item.original,
          translation: generated.translation || "",
          unclear: false,
          source: "gemini",
          confidence: 90,
        };
      });
      const next = withBlockTexts(result, blocks);
      setResult(next);
      setView("overlay");
      const overlayUrl = await paintOverlay(preview, paintableBlocks(blocks));
      if (historyMetaRef.current.id) {
        const items = await upsertHistoryItem({
          id: historyMetaRef.current.id,
          createdAt: historyMetaRef.current.createdAt,
          fileName: fileName || "image.jpg",
          sourceLanguage,
          engine,
          result: next,
          original: preview,
          overlay: overlayUrl || overlay,
        });
        setHistory(items);
      }
    } catch (err) {
      setError(err.message || "ส่ง Gemini ช่องนี้ไม่สำเร็จ");
    } finally {
      setBusy("");
      setBusyBlock(-1);
    }
  }

  function chooseEngine(next) {
    setEngine(next);
    window.localStorage.setItem(ENGINE_KEY, next);
    if (preview) {
      const map = readSourceEngines();
      map[fingerprintImage(preview)] = next;
      window.localStorage.setItem(SOURCE_ENGINE_KEY, JSON.stringify(map));
    }
  }

  function clearImage() {
    setPreview(null);
    setOverlay(null);
    setFileName("");
    setResult(null);
    setError("");
    setView("original");
    setProgress({ percent: 0, label: "" });
    historyMetaRef.current = { id: null, createdAt: null };
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  function restoreHistory(item) {
    historyMetaRef.current = { id: item.id, createdAt: item.createdAt };
    setPreview(item.original || item.originalThumb || null);
    setOverlay(item.overlay || item.overlayThumb || null);
    setFileName(item.fileName || "history.jpg");
    setResult(item.result || null);
    setSourceLanguage(item.sourceLanguage || "auto");
    if (ENGINES.includes(item.engine)) setEngine(item.engine);
    setView(item.overlay || item.overlayThumb ? "overlay" : "original");
    setError("");
    setLightboxOpen(false);
    setLightboxItem(null);
    setProgress({ percent: 0, label: "" });
  }

  function removeHistory(id) {
    const items = deleteHistoryItem(id);
    setHistory(items);
    if (historyMetaRef.current.id === id) {
      historyMetaRef.current = { id: null, createdAt: null };
    }
  }

  function removeAllHistory() {
    setHistory(clearHistory());
    historyMetaRef.current = { id: null, createdAt: null };
  }

  function updateBlock(index, translation) {
    if (!result) return;
    const blocks = result.blocks.map((block, i) =>
      i === index ? { ...block, translation } : block,
    );
    const next = {
      ...result,
      blocks,
      translation: blocks.map((block) => block.translation).join("\n\n"),
    };
    setResult(next);
    window.clearTimeout(paintTimer.current);
    paintTimer.current = window.setTimeout(async () => {
      const overlayUrl = await paintOverlay(preview, paintableBlocks(next.blocks));
      if (!historyMetaRef.current.id) return;
      const items = await upsertHistoryItem({
        id: historyMetaRef.current.id,
        createdAt: historyMetaRef.current.createdAt,
        fileName: fileName || "image.jpg",
        sourceLanguage,
        engine,
        result: next,
        original: preview,
        overlay: overlayUrl || overlay,
      });
      setHistory(items);
    }, 280);
  }

  async function copyText(label, text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  function downloadOverlay() {
    if (!overlay) return;
    const link = document.createElement("a");
    link.href = overlay;
    link.download = "phap-plae-th.jpg";
    link.click();
  }

  const shownImage = view === "overlay" && overlay ? overlay : preview;
  const translating = busy === "translate";
  const fetching = busy === "fetch";
  const lightboxOriginal = lightboxItem
    ? lightboxItem.original || lightboxItem.originalThumb
    : preview;
  const lightboxOverlay = lightboxItem
    ? lightboxItem.overlay || lightboxItem.overlayThumb
    : overlay;
  const lightboxShown =
    view === "overlay" && lightboxOverlay ? lightboxOverlay : lightboxOriginal;

  function closeLarge() {
    setLightboxOpen(false);
    setLightboxItem(null);
    setZoom(1);
  }

  function openLarge() {
    if (!shownImage) return;
    setLightboxItem(null);
    setZoom(1);
    setLightboxOpen(true);
  }

  function openHistoryLarge(item) {
    const hasOverlay = Boolean(item.overlay || item.overlayThumb);
    setLightboxItem(item);
    setView(hasOverlay ? "overlay" : "original");
    setZoom(1);
    setLightboxOpen(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-20 pt-8 sm:px-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-gold-dim">
            JP · KO · EN · CN → ไทย ทับข้อความเดิม
          </p>
          <h1 className="font-display text-4xl leading-none text-paper sm:text-6xl">
            ภาพแปล
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-foreground/70">
            ตรวจจับข้อความบนป้ายโฆษณาและมังงะ แล้ววางคำแปลภาษาไทยทับตัวอักษรเดิม
            อัปโหลดรูป หรือวาง URL รูปภาพได้
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-foreground/50">
          <span className="h-px w-8 bg-line" />
          {result?.providerLabel || engineLabel(engine)}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {SOURCE_LANGUAGES.map((language) => (
          <button
            key={language.code}
            type="button"
            onClick={() => setSourceLanguage(language.code)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              sourceLanguage === language.code
                ? "border-gold bg-gold text-ink"
                : "border-line text-paper hover:border-gold/60"
            }`}
          >
            {language.nativeName}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-paper">โหมด OCR</p>
          <p className="mt-1 text-xs leading-5 text-foreground/50">
            Auto: มังงะ/ญี่ปุ่น/จีน/เกาหลี → Gemini ทั้งหน้า · ป้ายพิมพ์ชัด → Tesseract ไม่กินโควต้า
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "auto", label: "Auto" },
            { id: "tesseract", label: "Tesseract" },
            { id: "gemini", label: "Gemini" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseEngine(item.id)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                engine === item.id ? "border-gold bg-gold text-ink" : "border-line text-paper"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          loadFromUrl(imageUrl);
        }}
      >
        <input
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="วาง URL รูปภาพ (ป้าย / มังงะ / โปสเตอร์)"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-paper outline-none placeholder:text-foreground/35 focus:border-gold"
        />
        <button
          type="submit"
          disabled={fetching}
          className="rounded-2xl border border-line px-5 py-3 text-sm text-paper disabled:opacity-40"
        >
          {fetching ? "กำลังโหลด…" : "โหลดจาก URL"}
        </button>
      </form>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div
          className={`relative overflow-hidden rounded-[28px] border bg-panel transition-colors ${
            dragOver ? "border-gold" : "border-line"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            loadFile(event.dataTransfer.files?.[0]);
          }}
        >
          <input
            id={fileInputId}
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => loadFile(event.target.files?.[0])}
          />
          <input
            id={cameraInputId}
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => loadFile(event.target.files?.[0])}
          />

          {preview ? (
            <div className="flex min-h-[420px] flex-col">
              {overlay ? (
                <div className="flex gap-2 border-b border-line px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setView("original")}
                    className={view === "original" ? "text-gold" : "text-foreground/50"}
                  >
                    ต้นฉบับ
                  </button>
                  <span className="text-foreground/25">/</span>
                  <button
                    type="button"
                    onClick={() => setView("overlay")}
                    className={view === "overlay" ? "text-gold" : "text-foreground/50"}
                  >
                    ทับไทย
                  </button>
                </div>
              ) : null}
              <div className="relative flex flex-1 items-center justify-center bg-black/40 p-4">
                {translating ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4">
                    <div className="rounded-2xl bg-black/70 px-4 py-3">
                      <div className="mb-2 flex justify-between text-xs text-paper">
                        <span>{progress.label}</span>
                        <span>{Math.round(progress.percent)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${Math.min(100, progress.percent)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={openLarge}
                  className="max-h-[560px] w-full cursor-zoom-in border-0 bg-transparent p-0"
                  title="เปิดรูปใหญ่"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shownImage}
                    alt={view === "overlay" ? "รูปที่ทับข้อความไทยแล้ว" : "รูปต้นฉบับ"}
                    className="max-h-[560px] w-full object-contain"
                  />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm">
                <p className="truncate text-foreground/60">{fileName}</p>
                <div className="flex gap-4">
                  <button type="button" onClick={openLarge} className="text-gold hover:underline">
                    เปิดรูปใหญ่
                  </button>
                  {overlay ? (
                    <button type="button" onClick={downloadOverlay} className="text-gold hover:underline">
                      ดาวน์โหลดรูปไทย
                    </button>
                  ) : null}
                  <button type="button" onClick={clearImage} className="text-foreground/60 hover:text-paper">
                    ลบรูป
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label
              htmlFor={fileInputId}
              className="flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-4 px-8 text-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line text-gold">
                +
              </span>
              <div>
                <p className="text-lg text-paper">อัปโหลดรูปป้ายหรือมังงะ</p>
                <p className="mt-2 text-sm text-foreground/50">
                  ลากวาง · คลิกเลือกไฟล์ · วางจากคลิปบอร์ด (Ctrl+V)
                </p>
              </div>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[28px] border border-line bg-panel p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">
              แปลแล้วทับด้วยไทย
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onTranslate}
                disabled={Boolean(busy) || (!preview && !imageUrl.trim())}
                className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                {translating
                  ? `${progress.label || "กำลังจับข้อความ…"} ${Math.round(progress.percent)}%`
                  : "ตรวจจับแล้วแปล"}
              </button>
              <label
                htmlFor={cameraInputId}
                className="cursor-pointer rounded-full border border-line px-5 py-3 text-sm text-paper"
              >
                ถ่ายรูป
              </label>
            </div>
            <p className="mt-3 text-xs text-foreground/50">
              {engine === "tesseract"
                ? "โหมด Tesseract — ไม่กินโควต้า Gemini"
                : `โหมด ${engine === "auto" ? "Auto" : "Gemini"} · เหลือ ${quota.remaining} จาก ${GEMINI_RPD} ครั้งวันนี้`}
            </p>
            {busy || progress.percent > 0 ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-foreground/55">
                  <span>{progress.label || (fetching ? "กำลังโหลดรูป" : "กำลังทำงาน")}</span>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-gold transition-[width] duration-200"
                    style={{ width: `${Math.min(100, progress.percent)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-[280px] flex-1 rounded-[28px] border border-line bg-paper p-6 text-ink shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            {error ? <p className="mb-4 text-sm leading-7 text-red-800">{error}</p> : null}

            {translating ? (
              <div>
                <p className="font-display text-2xl italic text-ink/70">
                  {progress.label || "กำลังหาตำแหน่งตัวหนังสือ แล้วแปลเป็นไทย…"}
                </p>
                <p className="mt-3 text-sm text-ink/50">{Math.round(progress.percent)}%</p>
              </div>
            ) : null}

            {!translating && !result ? (
              <div className="flex h-full min-h-[220px] flex-col justify-between">
                <p className="font-display text-3xl italic leading-snug text-ink/80">
                  พรีวิวรูปทับไทยจะโผล่ทางซ้าย
                </p>
                <ul className="space-y-1 text-sm text-ink/55">
                  <li>1. มังงะและภาษา ja/ko/zh ใช้ Gemini ทั้งหน้าโดยอัตโนมัติ</li>
                  <li>2. ป้ายพิมพ์ชัดใช้ Tesseract — ไม่กินโควต้า</li>
                  <li>3. แก้รายช่องใช้ Flash-Lite ถ้ายังมีโควต้า</li>
                </ul>
              </div>
            ) : null}

            {result ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-ink/45">
                  <span>
                    {result.hasText
                      ? `${labelForKind(result.kind)} · ${result.detectedLanguageName}`
                      : "ไม่พบข้อความ"}
                  </span>
                  <span>{result.blocks?.length || 0} บล็อก</span>
                </div>

                {result.hasText ? (
                  <>
                    <TextBlock
                      title="ต้นฉบับ"
                      text={result.originalText}
                      copied={copied === "original"}
                      onCopy={() => copyText("original", result.originalText)}
                    />
                    <TextBlock
                      title="คำแปลไทย"
                      text={result.translation || "ยังไม่แปล"}
                      copied={copied === "translation"}
                      onCopy={() => copyText("translation", result.translation)}
                      featured
                    />
                    {result.blocks?.length ? (
                      <div className="border-t border-ink/10 pt-4">
                        <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-ink/45">
                          แก้คำแปลในรูป
                        </h2>
                        <div className="flex flex-col gap-3">
                          {result.blocks.map((block, index) => (
                            <div key={`${block.x}-${block.y}-${index}`} className="block">
                              <span className="mb-1 block text-xs text-ink/45">
                                บล็อก {index + 1}
                                {block.unclear ? " · อ่านไม่ชัด" : ""}
                              </span>
                              <p className="mb-2 whitespace-pre-wrap rounded-xl border border-ink/10 bg-white/50 px-3 py-2 text-sm text-ink/75">
                                {block.original || "(ไม่มีต้นฉบับ)"}
                              </p>
                              {block.unclear ? (
                                <p className="mb-2 rounded-xl border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink/70">
                                  อ่านไม่ชัด — ไม่ได้ส่งไปแปล
                                </p>
                              ) : (
                                <textarea
                                  value={block.translation}
                                  onChange={(event) => updateBlock(index, event.target.value)}
                                  placeholder="ยังไม่แปล"
                                  rows={2}
                                  className="w-full resize-y rounded-xl border border-ink/15 bg-white/70 px-3 py-2 text-sm leading-6 outline-none focus:border-ink/40"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => geminiForBlock(index)}
                                disabled={Boolean(busy) || !canUseGemini().ok}
                                className="mt-2 text-xs text-gold hover:underline disabled:opacity-40"
                              >
                                {busyBlock === index
                                  ? "กำลังส่ง Flash-Lite ช่องนี้…"
                                  : `ใช้ Flash-Lite ช่องนี้ · เหลือ ${quota.remaining}/${GEMINI_RPD}`}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm leading-7">
                      {result.needsGemini || result.kind === "manga"
                        ? "หน้านี้เป็นมังงะ ฟองพูดและตัวญี่ปุ่นแนวตั้ง Tesseract อ่านไม่ได้"
                        : "ไม่พบข้อความที่อ่านได้ในรูปนี้"}
                    </p>
                    <button
                      type="button"
                      onClick={geminiWholePage}
                      disabled={Boolean(busy)}
                      className="self-start rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                    >
                      {busy === "translate"
                        ? "กำลังส่ง Gemini…"
                        : `ใช้ Gemini ทั้งหน้า · วันนี้ ${quota.used}/${GEMINI_RPD}`}
                    </button>
                    <p className="text-xs text-ink/50">กินโควต้า 1 ครั้ง — แปลทั้งหน้าในคำขอเดียว</p>
                  </div>
                )}

                {result.notes ? (
                  <p className="border-t border-ink/10 pt-4 text-sm leading-6 text-ink/60">
                    {result.notes}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-panel p-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xs uppercase tracking-[0.2em] text-foreground/45">ประวัติในเครื่องนี้</h2>
            <p className="mt-1 text-sm text-foreground/55">
              ไฟล์ที่แปลแล้วเก็บใน localStorage ของเบราว์เซอร์นี้
            </p>
          </div>
          {history.length ? (
            <button
              type="button"
              onClick={removeAllHistory}
              className="text-xs text-foreground/45 hover:text-paper"
            >
              ล้างทั้งหมด
            </button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-foreground/40">ยังไม่มีไฟล์เก่า — แปลรูปแล้วจะโผล่ที่นี่</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {history.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-line bg-background">
                <button
                  type="button"
                  onClick={() => openHistoryLarge(item)}
                  className="block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
                  title="เปิดรูปใหญ่"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.overlayThumb || item.originalThumb || item.overlay || item.original}
                    alt={item.fileName || "ไฟล์เก่า"}
                    className="h-28 w-full object-cover"
                  />
                  <span className="block truncate px-3 pt-2 text-sm text-paper">
                    {item.fileName || "ไม่มีชื่อ"}
                  </span>
                  <span className="block px-3 pb-3 text-[11px] text-foreground/45">
                    {formatWhen(item.createdAt)}
                    {item.result?.blocks?.length
                      ? ` · ${item.result.blocks.length} บล็อก`
                      : ""}
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                  <button
                    type="button"
                    onClick={() => restoreHistory(item)}
                    className="text-xs text-gold hover:underline"
                  >
                    เปิดในตัวแปล
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistory(item.id)}
                    className="text-xs text-foreground/40 hover:text-paper"
                  >
                    ลบ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lightboxOpen && lightboxShown ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/92"
          role="dialog"
          aria-modal="true"
          aria-label="รูปขนาดใหญ่"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-sm text-paper">
            <div className="flex flex-wrap items-center gap-3">
              {lightboxItem ? (
                <span className="max-w-[40vw] truncate text-white/70">
                  {lightboxItem.fileName || "ไฟล์เก่า"}
                </span>
              ) : null}
              {lightboxOverlay ? (
                <>
                  <button
                    type="button"
                    onClick={() => setView("original")}
                    className={view === "original" ? "text-gold" : "text-white/50"}
                  >
                    ต้นฉบับ
                  </button>
                  <span className="text-white/20">/</span>
                  <button
                    type="button"
                    onClick={() => setView("overlay")}
                    className={view === "overlay" ? "text-gold" : "text-white/50"}
                  >
                    ทับไทย
                  </button>
                </>
              ) : (
                <span className="text-white/70">รูปต้นฉบับ</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lightboxItem ? (
                <button
                  type="button"
                  onClick={() => restoreHistory(lightboxItem)}
                  className="rounded-full border border-white/20 px-3 py-1 text-white/80"
                >
                  เปิดในตัวแปล
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}
                className="rounded-full border border-white/20 px-3 py-1 text-white/80"
              >
                −
              </button>
              <span className="w-12 text-center text-white/60">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}
                className="rounded-full border border-white/20 px-3 py-1 text-white/80"
              >
                +
              </button>
              <button
                type="button"
                onClick={closeLarge}
                className="ml-2 rounded-full bg-gold px-4 py-1 font-medium text-ink"
              >
                ปิด
              </button>
            </div>
          </div>
          <button
            type="button"
            className="min-h-0 flex-1 cursor-zoom-out overflow-auto border-0 bg-transparent p-4"
            onClick={closeLarge}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxShown}
              alt="รูปขนาดใหญ่"
              onClick={(event) => event.stopPropagation()}
              className="mx-auto block max-w-none object-contain"
              style={{
                width: `${zoom * 100}%`,
                maxWidth: zoom === 1 ? "100%" : "none",
              }}
            />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function paintableBlocks(blocks) {
  return (blocks || []).filter((block) => block.translation && !block.unclear);
}

function tesseractIsPoor(data) {
  const blocks = data?.blocks || [];
  if (data?.needsGemini || data?.kind === "manga") return true;
  if (!data?.hasText || !blocks.length) return true;
  const unclear = blocks.filter((block) => block.unclear).length;
  if (unclear >= Math.max(1, blocks.length * 0.55)) return true;
  const short = blocks.filter(
    (block) => String(block.original || "").replace(/\s+/g, "").length < 3,
  ).length;
  return short >= Math.max(2, Math.ceil(blocks.length * 0.45));
}

function untranslatedFromOcr(data, notes) {
  const blocks = (data?.blocks || []).map((block) => ({ ...block, translation: "" }));
  return {
    ...data,
    blocks,
    translation: "",
    originalText: blocks.map((block) => block.original).filter(Boolean).join("\n\n"),
    hasText: blocks.some((block) => block.original),
    notes: [data?.notes, notes].filter(Boolean).join(" "),
    needsGemini: true,
  };
}

function withBlockTexts(result, blocks) {
  return {
    ...result,
    blocks,
    hasText: blocks.some((block) => block.original || block.translation),
    originalText: blocks.map((block) => block.original).filter(Boolean).join("\n\n"),
    translation: blocks.map((block) => block.translation).filter(Boolean).join("\n\n"),
  };
}

function readSourceEngines() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOURCE_ENGINE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function engineLabel(value) {
  if (value === "auto") return "Auto · มังงะไป Gemini ก่อน";
  if (value === "gemini") return "Gemini (กินโควต้า)";
  return "Tesseract ในเบราว์เซอร์ — ไม่กินโควต้า";
}

function formatWhen(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function labelForKind(kind) {
  if (kind === "manga") return "มังงะ";
  if (kind === "sign") return "ป้ายโฆษณา";
  if (kind === "mixed") return "ป้าย + มังงะ";
  return "รูปภาพ";
}

function TextBlock({ title, text, onCopy, copied, featured = false }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.18em] text-ink/45">{title}</h2>
        <button type="button" onClick={onCopy} className="text-xs text-ink/50 hover:text-ink">
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
      <p className={`whitespace-pre-wrap leading-7 ${featured ? "text-lg font-medium" : "text-sm text-ink/80"}`}>
        {text}
      </p>
    </div>
  );
}
