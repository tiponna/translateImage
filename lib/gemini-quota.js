const KEY = "phap-plae-gemini-quota-v1";
export const GEMINI_RPD = 20;
export const GEMINI_RPM = 5;

export function readGeminiQuota() {
  if (typeof window === "undefined") {
    return { date: todayKey(), used: 0, stamps: [], remaining: GEMINI_RPD };
  }
  const today = todayKey();
  let data = { date: today, used: 0, stamps: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (parsed && parsed.date === today) {
      data = {
        date: today,
        used: Number(parsed.used) || 0,
        stamps: Array.isArray(parsed.stamps) ? parsed.stamps : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { ...data, remaining: Math.max(0, GEMINI_RPD - data.used) };
}

export function canUseGemini() {
  const quota = readGeminiQuota();
  if (quota.used >= GEMINI_RPD) {
    return { ok: false, reason: "rpd", quota };
  }
  const cutoff = Date.now() - 60 * 1000;
  const recent = quota.stamps.filter((stamp) => stamp > cutoff);
  if (recent.length >= GEMINI_RPM) {
    return { ok: false, reason: "rpm", quota };
  }
  return { ok: true, reason: "", quota };
}

export function recordGeminiUse() {
  const quota = readGeminiQuota();
  const cutoff = Date.now() - 60 * 1000;
  const next = {
    date: todayKey(),
    used: quota.used + 1,
    stamps: [...quota.stamps.filter((stamp) => stamp > cutoff), Date.now()],
  };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return { ...next, remaining: Math.max(0, GEMINI_RPD - next.used) };
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
