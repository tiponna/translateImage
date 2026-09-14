"use client";

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  Link2,
  X,
  Sparkles,
  ImageIcon,
  Loader2,
  FileImage,
} from "lucide-react";
import { SOURCE_LANGUAGES, TARGET_LANGUAGES } from "@/lib/languages";

type InputMode = "upload" | "url";

export type OcrMode = "comic" | "document";

type Props = {
  sourceLang: string;
  targetLang: string;
  onSourceLang: (v: string) => void;
  onTargetLang: (v: string) => void;
  ocrMode: OcrMode;
  onOcrMode: (v: OcrMode) => void;
  previewUrl: string | null;
  fileName: string | null;
  fileSize: string | null;
  imageUrlInput: string;
  onImageUrlInput: (v: string) => void;
  onFileSelect: (file: File | null) => void;
  onImportUrl: () => void;
  onClear: () => void;
  onTranslate: () => void;
  loading: boolean;
  inputMode: InputMode;
  onInputMode: (m: InputMode) => void;
};

export default function UploadPanel({
  sourceLang,
  targetLang,
  onSourceLang,
  onTargetLang,
  ocrMode,
  onOcrMode,
  previewUrl,
  fileName,
  fileSize,
  imageUrlInput,
  onImageUrlInput,
  onFileSelect,
  onImportUrl,
  onClear,
  onTranslate,
  loading,
  inputMode,
  onInputMode,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP)");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("ไฟล์ใหญ่เกิน 10MB");
        return;
      }
      onFileSelect(file);
    },
    [onFileSelect],
  );

  return (
    <section className="flex flex-col gap-4">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-blue-600 via-blue-500 to-sky-400 px-6 py-5 text-white shadow-sm">
        <div className="relative z-10 max-w-[70%]">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            แปลข้อความจากรูปภาพได้ทันที
          </h1>
          <p className="mt-1 text-sm text-blue-100">
            อัปโหลดการ์ตูน เมนู หรือเอกสาร — OCR แล้วแปลให้อัตโนมัติ
          </p>
        </div>
        <div
          className="pointer-events-none absolute -right-2 -top-4 h-28 w-28 rotate-12 rounded-3xl bg-white/10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-8 top-4 h-14 w-14 rounded-2xl border border-white/30 bg-white/15 shadow-inner backdrop-blur-sm"
          aria-hidden
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => onInputMode("upload")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            inputMode === "upload"
              ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-200"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200"
          }`}
        >
          <Upload className="h-4 w-4" />
          อัปโหลดรูปภาพ
        </button>
        <button
          type="button"
          onClick={() => onInputMode("url")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            inputMode === "url"
              ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-200"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200"
          }`}
        >
          <Link2 className="h-4 w-4" />
          นำเข้าจาก URL
        </button>
      </div>

      {/* Input area */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {inputMode === "upload" ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition ${
                dragging
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                  : "border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-800/30 dark:hover:border-blue-400/60 dark:hover:bg-blue-950/20"
              }`}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                ลากไฟล์มาวาง หรือคลิกเพื่อเลือก
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-300">
                JPG, PNG, WEBP &lt; 10MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {fileName && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
                <FileImage className="h-5 w-5 shrink-0 text-blue-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {fileName}
                  </p>
                  {fileSize && <p className="text-xs text-slate-400 dark:text-slate-300">{fileSize}</p>}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="ลบไฟล์"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              value={imageUrlInput}
              onChange={(e) => onImageUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-blue-500/30 placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 dark:border-slate-800 dark:bg-slate-900 dark:placeholder:text-slate-500 dark:focus:border-blue-400"
            />
            <button
              type="button"
              onClick={onImportUrl}
              className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900"
            >
              Import
            </button>
          </div>
        )}

        {/* OCR mode */}
        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
            โหมดจับตัวอักษร
          </span>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onOcrMode("comic")}
              className={`flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                ocrMode === "comic"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-200"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-300"
              }`}
            >
              การ์ตูน / มังงะ
            </button>
            <button
              type="button"
              onClick={() => onOcrMode("document")}
              className={`flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                ocrMode === "document"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-200"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-300"
              }`}
            >
              เอกสาร / ป้าย
            </button>
          </div>
          {ocrMode === "comic" && (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              ปรับสำหรับฟองคำพูด ตัวอักษรเล็ก และ screentone
            </p>
          )}
        </div>

        {/* Languages */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              ภาษาต้นทาง
            </span>
            <select
              value={sourceLang}
              onChange={(e) => onSourceLang(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              {SOURCE_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              ภาษาปลายทาง
            </span>
            <select
              value={targetLang}
              onChange={(e) => onTargetLang(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          disabled={loading || !previewUrl}
          onClick={onTranslate}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              กำลังแปล...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              เริ่มแปลภาษา
            </>
          )}
        </button>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">ตัวอย่างภาพ</h2>
        </div>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="ตัวอย่างภาพที่อัปโหลด"
            className="max-h-72 w-full rounded-lg object-contain bg-slate-50 dark:bg-slate-800/30"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400 dark:bg-slate-800/30 dark:text-slate-400">
            ยังไม่มีรูปภาพ
          </div>
        )}
      </div>
    </section>
  );
}
