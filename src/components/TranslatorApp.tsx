"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UploadPanel, { type OcrMode } from "@/components/UploadPanel";
import ResultsPanel from "@/components/ResultsPanel";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function TranslatorApp() {
  const [inputMode, setInputMode] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [importedUrl, setImportedUrl] = useState<string | null>(null);

  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("th");
  const [ocrMode, setOcrMode] = useState<OcrMode>("comic");

  // Mobile sidebar drawer (slide in/out). Default: closed.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [originalText, setOriginalText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translatedAt, setTranslatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  // revoke object URL เมื่อเปลี่ยนไฟล์
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const clearImage = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setFile(null);
    setPreviewUrl(null);
    setFileName(null);
    setFileSize(null);
    setImportedUrl(null);
  }, [objectUrl]);

  const onFileSelect = useCallback(
    (f: File | null) => {
      if (!f) {
        clearImage();
        return;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const url = URL.createObjectURL(f);
      setObjectUrl(url);
      setFile(f);
      setPreviewUrl(url);
      setFileName(f.name);
      setFileSize(formatBytes(f.size));
      setImportedUrl(null);
      setOriginalText("");
      setTranslatedText("");
      setTranslatedAt(null);
      setError(null);
    },
    [clearImage, objectUrl],
  );

  function onImportUrl() {
    const url = imageUrlInput.trim();
    if (!url) {
      setError("กรุณาใส่ URL รูปภาพ");
      return;
    }
    try {
      // validate URL
      new URL(url);
    } catch {
      setError("URL ไม่ถูกต้อง");
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setFile(null);
    setImportedUrl(url);
    setPreviewUrl(url);
    setFileName(url.split("/").pop()?.split("?")[0] || "image-from-url");
    setFileSize(null);
    setOriginalText("");
    setTranslatedText("");
    setTranslatedAt(null);
    setError(null);
  }

  async function onTranslate() {
    if (!previewUrl) return;
    setLoading(true);
    setError(null);
    setOriginalText("");
    setTranslatedText("");

    try {
      // 1) OCR
      const form = new FormData();
      form.set("sourceLang", sourceLang);
      form.set("ocrMode", ocrMode);
      if (file) {
        form.set("file", file);
      } else if (importedUrl) {
        form.set("imageUrl", importedUrl);
      } else {
        throw new Error("ไม่พบรูปภาพ");
      }

      const ocrRes = await fetch("/api/ocr", { method: "POST", body: form });
      const ocrData = await ocrRes.json();
      if (!ocrRes.ok) throw new Error(ocrData.error || "OCR ล้มเหลว");
      if (!ocrData.text) throw new Error(ocrData.error || "ไม่พบข้อความในรูปภาพ");

      setOriginalText(ocrData.text);

      // 2) Translate
      const trRes = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ocrData.text,
          sourceLang,
          targetLang,
        }),
      });
      const trData = await trRes.json();
      if (!trRes.ok) throw new Error(trData.error || "แปลล้มเหลว");

      setTranslatedText(trData.translatedText || "");
      setTranslatedAt("สักครู่");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8fafc] dark:bg-[#0b1220]">
      {/* Mobile sidebar drawer */}
      <div
        className={`fixed inset-0 z-50 ${sidebarOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${
            sidebarOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <div
          className={`absolute left-0 top-0 h-full w-[240px] transform transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/20 bg-slate-900/30 text-white hover:bg-slate-900/40"
            aria-label="ปิด Sidebar"
          >
            <X className="h-4 w-4" />
          </button>
          <Sidebar />
        </div>
      </div>

      <main
        className={`flex min-w-0 flex-1 flex-col overflow-y-auto ${
          sidebarOpen ? "md:pl-[240px]" : "md:pl-0"
        } transition-[padding-left] duration-300`}
      >
        {/* mobile top bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            aria-label="เปิด Sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Image Translator</span>
        </div>

        <div className="w-full flex-1 p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
            <UploadPanel
              sourceLang={sourceLang}
              targetLang={targetLang}
              onSourceLang={setSourceLang}
              onTargetLang={setTargetLang}
              ocrMode={ocrMode}
              onOcrMode={setOcrMode}
              previewUrl={previewUrl}
              fileName={fileName}
              fileSize={fileSize}
              imageUrlInput={imageUrlInput}
              onImageUrlInput={setImageUrlInput}
              onFileSelect={onFileSelect}
              onImportUrl={onImportUrl}
              onClear={clearImage}
              onTranslate={onTranslate}
              loading={loading}
              inputMode={inputMode}
              onInputMode={setInputMode}
            />
            <ResultsPanel
              originalText={originalText}
              translatedText={translatedText}
              targetLang={targetLang}
              translatedAt={translatedAt}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
