export const SOURCE_LANGUAGES = [
  { code: "auto", englishName: "Auto", nativeName: "ตรวจจับอัตโนมัติ" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語" },
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "zh", englishName: "Chinese", nativeName: "中文" },
];

export function getSourceLanguage(code) {
  return SOURCE_LANGUAGES.find((language) => language.code === code) ?? null;
}
