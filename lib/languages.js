export const SOURCE_LANGUAGES = [
  { code: "auto", englishName: "Auto", nativeName: "ตรวจจับอัตโนมัติ" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語" },
  { code: "ko", englishName: "Korean", nativeName: "한국어" },
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "zh", englishName: "Chinese", nativeName: "中文" },
];

export function getSourceLanguage(code) {
  return SOURCE_LANGUAGES.find((language) => language.code === code) ?? null;
}

export function isCjkSource(code) {
  return code === "ja" || code === "ko" || code === "zh";
}

export function textLooksCjk(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(String(text || ""));
}
