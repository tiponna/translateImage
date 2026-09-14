"use client";

import { useState } from "react";
import {
  Copy,
  Download,
  Check,
  ThumbsUp,
  ThumbsDown,
  ClipboardList,
} from "lucide-react";
import { labelForTarget } from "@/lib/languages";

type Props = {
  originalText: string;
  translatedText: string;
  targetLang: string;
  translatedAt: string | null;
};

export default function ResultsPanel({
  originalText,
  translatedText,
  targetLang,
  translatedAt,
}: Props) {
  const [copied, setCopied] = useState<"all" | "orig" | "trans" | null>(null);

  const hasResult = Boolean(originalText || translatedText);

  async function copyText(text: string, key: "all" | "orig" | "trans") {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function downloadTxt() {
    const content = [
      "=== ข้อความต้นฉบับ ===",
      originalText,
      "",
      `=== คำแปล (${labelForTarget(targetLang)}) ===`,
      translatedText,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">ผลลัพธ์การแปล</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!hasResult}
            onClick={() =>
              copyText(
                `ต้นฉบับ:\n${originalText}\n\nคำแปล:\n${translatedText}`,
                "all",
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {copied === "all" ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            คัดลอกทั้งหมด
          </button>
          <button
            type="button"
            disabled={!hasResult}
            onClick={downloadTxt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            ดาวน์โหลด
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              ข้อความต้นฉบับ (ตรวจจับจากรูปภาพ)
            </p>
            <button
              type="button"
              disabled={!originalText}
              onClick={() => copyText(originalText, "orig")}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label="คัดลอกต้นฉบับ"
            >
              {copied === "orig" ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <textarea
            readOnly
            value={originalText}
            placeholder="ข้อความที่ OCR ได้จะแสดงที่นี่..."
            className="min-h-[160px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-100"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              คำแปล ({labelForTarget(targetLang)})
            </p>
            <button
              type="button"
              disabled={!translatedText}
              onClick={() => copyText(translatedText, "trans")}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label="คัดลอกคำแปล"
            >
              {copied === "trans" ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <textarea
            readOnly
            value={translatedText}
            placeholder="คำแปลจะแสดงที่นี่..."
            className="min-h-[160px] w-full resize-y rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3 text-sm leading-relaxed text-slate-800 outline-none dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {translatedAt ? `แปลเมื่อ ${translatedAt}` : "ยังไม่ได้แปล"}
        </p>
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
          <span className="text-xs">เป็นประโยชน์ไหม?</span>
          <button
            type="button"
            className="rounded-md p-1 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
            aria-label="ถูกใจ"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded-md p-1 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800 dark:hover:text-rose-400"
            aria-label="ไม่ถูกใจ"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
