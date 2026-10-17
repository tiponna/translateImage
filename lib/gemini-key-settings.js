export const KEY_SLOTS = [
  { id: "primary", label: "คีย์หลัก" },
  { id: "spare", label: "คีย์สำรอง 1" },
  { id: "spare2", label: "คีย์สำรอง 2" },
];

const STORAGE_KEY = "phap-plae-gemini-key-v1";

export function defaultKeySettings() {
  return { slot: "primary", useCustom: false, customKey: "" };
}

export function loadKeySettings() {
  if (typeof window === "undefined") return defaultKeySettings();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return defaultKeySettings();
    const slot = parsed.slot === "spare" || parsed.slot === "spare2" ? parsed.slot : "primary";
    return {
      slot,
      useCustom: parsed.useCustom === true,
      customKey: String(parsed.customKey || ""),
    };
  } catch {
    return defaultKeySettings();
  }
}

export function saveKeySettings(settings) {
  const next = {
    slot: settings.slot === "spare" || settings.slot === "spare2" ? settings.slot : "primary",
    useCustom: settings.useCustom === true,
    customKey: String(settings.customKey || ""),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function keyRequestFields(settings) {
  const useCustom = settings?.useCustom === true;
  return {
    geminiSlot: settings?.slot === "spare" || settings?.slot === "spare2" ? settings.slot : "primary",
    geminiKey: useCustom ? String(settings.customKey || "").trim() : "",
  };
}

export function keyScope(settings) {
  if (settings?.useCustom && settings.customKey) {
    const key = String(settings.customKey);
    return `custom:${key.length}:${key.slice(-4)}`;
  }
  return settings?.slot === "spare" || settings?.slot === "spare2" ? settings.slot : "primary";
}

export function keySettingsLabel(settings) {
  if (settings?.useCustom && settings.customKey) return "คีย์ของฉัน";
  const slot = KEY_SLOTS.find((item) => item.id === settings?.slot);
  return slot?.label || "คีย์หลัก";
}
