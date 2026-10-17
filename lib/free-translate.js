export async function translateLinesToThai(texts, sourceLanguage) {
  if (!texts.length) return { translations: [], provider: "none", notes: "" };
  const response = await fetch("/api/translate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, sourceLanguage }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "แปลข้อความจาก Tesseract ไม่สำเร็จ");
  }
  return {
    translations: Array.isArray(data.translations) ? data.translations : [],
    provider: data.provider || "",
    notes: data.notes || "",
  };
}
