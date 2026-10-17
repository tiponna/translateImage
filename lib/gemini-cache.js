const KEY = "phap-plae-gemini-cache-v3";
const MAX_ITEMS = 40;

export function fingerprintImage(dataUrl) {
  if (!dataUrl) return "";
  return `${dataUrl.length}:${dataUrl.slice(21, 90)}:${dataUrl.slice(-48)}`;
}

export function geminiCacheKey({ image, sourceLanguage, difficulty, region, pageKind, keyScope }) {
  return [
    fingerprintImage(image),
    sourceLanguage || "auto",
    difficulty || "hard",
    region ? "region" : "page",
    pageKind || "",
    keyScope || "primary",
  ].join("|");
}

export function getGeminiCache(cacheKey) {
  if (typeof window === "undefined") return null;
  try {
    const items = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    const hit = items.find((item) => item.key === cacheKey);
    return hit?.value || null;
  } catch {
    return null;
  }
}

export function setGeminiCache(cacheKey, value) {
  if (typeof window === "undefined") return;
  let items = [];
  try {
    items = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }
  items = items.filter((item) => item.key !== cacheKey);
  items.unshift({ key: cacheKey, value, at: Date.now() });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, 8)));
  }
}
