const SLOTS = {
  primary: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  spare: ["GEMINI_API_KEY_spare"],
  spare2: ["GEMINI_API_KEY_spare_2"],
};

export function normalizeGeminiSlot(slot) {
  return slot === "spare" || slot === "spare2" ? slot : "primary";
}

export function envKeyForSlot(slot) {
  const names = SLOTS[normalizeGeminiSlot(slot)] || SLOTS.primary;
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

export function resolveGeminiKey({ geminiKey, geminiSlot } = {}) {
  const custom = String(geminiKey || "").trim();
  if (custom) return custom;
  return envKeyForSlot(geminiSlot);
}

export function geminiSlotStatus() {
  return {
    primary: Boolean(envKeyForSlot("primary")),
    spare: Boolean(envKeyForSlot("spare")),
    spare2: Boolean(envKeyForSlot("spare2")),
  };
}
