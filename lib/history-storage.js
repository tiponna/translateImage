const KEY = "phap-plae-history-v1";
const MAX_ITEMS = 16;

export function loadHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function upsertHistoryItem(item) {
  const compact = {
    ...item,
    createdAt: item.createdAt || Date.now(),
    original: await shrinkDataUrl(item.original, 1100, 0.72),
    overlay: await shrinkDataUrl(item.overlay, 1100, 0.72),
    originalThumb: await shrinkDataUrl(item.original || item.originalThumb, 280, 0.62),
    overlayThumb: await shrinkDataUrl(item.overlay || item.overlayThumb, 280, 0.62),
  };

  let items = loadHistory().filter((entry) => entry.id !== compact.id);
  items.unshift(compact);
  items = items.slice(0, MAX_ITEMS);

  while (!write(items) && items.length) {
    const bulky = items.find((entry) => entry.original || entry.overlay);
    if (bulky) {
      bulky.original = "";
      bulky.overlay = "";
    } else {
      items.pop();
    }
  }

  return loadHistory();
}

export function deleteHistoryItem(id) {
  const items = loadHistory().filter((entry) => entry.id !== id);
  write(items);
  return items;
}

export function clearHistory() {
  write([]);
  return [];
}

function write(items) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    if (error?.name === "QuotaExceededError" || error?.code === 22) return false;
    console.error("history write failed", error);
    return false;
  }
}

async function shrinkDataUrl(dataUrl, maxEdge, quality) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return "";
  }

  const image = await loadImage(dataUrl).catch(() => null);
  if (!image) return "";

  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("shrink failed"));
    image.src = src;
  });
}
