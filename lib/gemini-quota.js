const KEY = "phap-plae-gemini-quota-v1";
export const GEMINI_RPD = 20;
export const GEMINI_RPM = 5;

export function readGeminiQuota(scope = "primary") {
  const bucket = bucketFor(readStore(), scope);
  return present(bucket, scope);
}

export function canUseGemini(scope = "primary") {
  const quota = readGeminiQuota(scope);
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

export function recordGeminiUse(scope = "primary") {
  const store = readStore();
  const id = scopeId(scope);
  const quota = bucketFor(store, id);
  const cutoff = Date.now() - 60 * 1000;
  const next = {
    date: todayKey(),
    used: quota.used + 1,
    stamps: [...quota.stamps.filter((stamp) => stamp > cutoff), Date.now()],
  };
  store.scopes[id] = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  }
  return present(next, id);
}

function present(bucket, scope) {
  return {
    ...bucket,
    scope: scopeId(scope),
    remaining: Math.max(0, GEMINI_RPD - bucket.used),
  };
}

function bucketFor(store, scope) {
  const today = todayKey();
  const bucket = store.scopes[scopeId(scope)];
  if (!bucket || bucket.date !== today) return emptyBucket(today);
  return bucket;
}

function readStore() {
  const fresh = { version: 2, scopes: {} };
  if (typeof window === "undefined") return fresh;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fresh;
    if (!parsed.scopes) {
      const today = todayKey();
      if (parsed.date !== today) return fresh;
      return {
        version: 2,
        scopes: {
          primary: {
            date: today,
            used: Number(parsed.used) || 0,
            stamps: Array.isArray(parsed.stamps) ? parsed.stamps : [],
          },
        },
      };
    }
    const today = todayKey();
    const scopes = {};
    for (const [name, bucket] of Object.entries(parsed.scopes)) {
      if (!bucket || bucket.date !== today) continue;
      scopes[name] = {
        date: today,
        used: Number(bucket.used) || 0,
        stamps: Array.isArray(bucket.stamps) ? bucket.stamps : [],
      };
    }
    return { version: 2, scopes };
  } catch {
    return fresh;
  }
}

function emptyBucket(date) {
  return { date, used: 0, stamps: [] };
}

function scopeId(scope) {
  const value = String(scope || "").trim();
  return value || "primary";
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
