import { prepareHistoryItem } from "@/lib/history-storage";

const SAVE_CATEGORY_KEY = "phap-plae-drive-category";

export function readSavedCategory() {
  if (typeof window === "undefined") return "none";
  return window.localStorage.getItem(SAVE_CATEGORY_KEY) || "none";
}

export function rememberCategory(categoryId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVE_CATEGORY_KEY, categoryId || "none");
}

export async function fetchDriveStatus() {
  const response = await fetch("/api/drive/status", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  return {
    configured: Boolean(data.configured),
    connected: Boolean(data.connected),
    expired: Boolean(data.expired),
  };
}

export async function fetchLibrary() {
  return readJson(await fetch("/api/library", { cache: "no-store" }));
}

export async function fetchDrivePage(id) {
  const data = await readJson(await fetch(`/api/library/pages?id=${encodeURIComponent(id)}`, { cache: "no-store" }));
  return data.page;
}

export async function saveDrivePage(item) {
  const compact = await prepareHistoryItem(item);
  const form = new FormData();
  form.set(
    "meta",
    JSON.stringify({
      id: compact.id,
      categoryId: compact.categoryId || "none",
      fileName: compact.fileName || "",
      sourceLanguage: compact.sourceLanguage || "",
      engine: compact.engine || "",
      createdAt: compact.createdAt,
      result: compact.result || null,
    }),
  );
  appendImage(form, "original", compact.original);
  appendImage(form, "overlay", compact.overlay);
  appendImage(form, "originalThumb", compact.originalThumb);
  appendImage(form, "overlayThumb", compact.overlayThumb);
  return readJson(await fetch("/api/library/pages", { method: "POST", body: form }));
}

export async function deleteDrivePage(id) {
  return readJson(await fetch(`/api/library/pages?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function clearDrivePages() {
  return readJson(await fetch("/api/library/pages?all=1", { method: "DELETE" }));
}

export async function moveDrivePage(id, categoryId) {
  return readJson(
    await fetch("/api/library/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, categoryId }),
    }),
  );
}

export async function createDriveCategory(name) {
  return readJson(
    await fetch("/api/library/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function deleteDriveCategory(id) {
  return readJson(await fetch(`/api/library/categories?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function disconnectDrive() {
  await fetch("/api/drive/disconnect", { method: "POST" });
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "เชื่อม Google Drive ไม่สำเร็จ");
  return data;
}

function appendImage(form, name, dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  if (blob) form.set(name, blob, `${name}.jpg`);
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  const [header, data] = dataUrl.split(",");
  if (!data) return null;
  const mime = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
