"use client";

import { useEffect, useState } from "react";
import {
  KEY_SLOTS,
  defaultKeySettings,
  keySettingsLabel,
  loadKeySettings,
  saveKeySettings,
} from "@/lib/gemini-key-settings";

export default function KeySettings({ onChange }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(defaultKeySettings);
  const [draft, setDraft] = useState(defaultKeySettings);
  const [slots, setSlots] = useState({ primary: false, spare: false, spare2: false });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const current = loadKeySettings();
    setSaved(current);
    setDraft(current);
    onChange?.(current);
  }, [onChange]);

  useEffect(() => {
    fetch("/api/gemini-keys")
      .then((response) => response.json())
      .then((data) => {
        if (data && typeof data === "object") setSlots(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function openPanel() {
    setDraft(loadKeySettings());
    setError("");
    setNotice("");
    setOpen(true);
  }

  function save() {
    if (draft.useCustom && !String(draft.customKey || "").trim()) {
      setError("ใส่คีย์ก่อนบันทึก");
      setNotice("");
      return;
    }
    const next = saveKeySettings(draft);
    setSaved(next);
    onChange?.(next);
    setError("");
    setNotice("บันทึกแล้ว");
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="rounded-full border border-line px-3 py-1.5 text-xs text-paper hover:border-gold/60"
      >
        ตั้งค่า · {keySettingsLabel(saved)}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-transparent"
            aria-label="ปิดตั้งค่า"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-[28px] border border-line bg-panel p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg text-paper">ตั้งค่าคีย์ Gemini</h2>
                <p className="mt-1 text-xs leading-5 text-foreground/50">
                  เลือกคีย์จาก .env.local หรือใส่คีย์สำรองเอง เก็บในเบราว์เซอร์นี้เท่านั้น
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-foreground/45 hover:text-paper"
              >
                ปิด
              </button>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground/45">
                เลือกคีย์สำรอง
              </legend>
              {KEY_SLOTS.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm text-paper">
                    <input
                      type="radio"
                      name="gemini-slot"
                      checked={draft.slot === item.id}
                      onChange={() => setDraft((current) => ({ ...current, slot: item.id }))}
                    />
                    {item.label}
                  </span>
                  <span className="text-xs text-foreground/45">
                    {slots[item.id] ? "มีในเครื่อง" : "ยังไม่ตั้ง"}
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-paper">
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.useCustom}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, useCustom: event.target.checked }))
                }
              />
              <span>
                ใส่คีย์ของฉัน
                <span className="mt-0.5 block text-xs text-foreground/45">
                  ถ้าติ๊ก จะใช้คีย์ด้านล่างแทนช่องที่เลือก
                </span>
              </span>
            </label>
            <input
              type="password"
              autoComplete="off"
              disabled={!draft.useCustom}
              value={draft.customKey}
              onChange={(event) =>
                setDraft((current) => ({ ...current, customKey: event.target.value }))
              }
              placeholder="วาง GEMINI_API_KEY"
              className="mt-2 w-full rounded-2xl border border-line bg-background px-4 py-3 text-sm text-paper outline-none placeholder:text-foreground/35 focus:border-gold disabled:opacity-40"
            />

            {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            {notice ? <p className="mt-3 text-sm text-gold">{notice}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-4 py-2 text-sm text-paper"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
