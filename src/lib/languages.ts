export const SOURCE_LANGUAGES = [
  { value: "auto", label: "ตรวจจับอัตโนมัติ (Auto Detect)" },
  { value: "en", label: "อังกฤษ (English)" },
  { value: "th", label: "ไทย (Thai)" },
  { value: "zh", label: "จีน (Chinese)" },
  { value: "ja", label: "ญี่ปุ่น (Japanese)" },
  { value: "ko", label: "เกาหลี (Korean)" },
  { value: "vi", label: "เวียดนาม (Vietnamese)" },
] as const;

export const TARGET_LANGUAGES = [
  { value: "th", label: "ไทย (Thai)" },
  { value: "en", label: "อังกฤษ (English)" },
  { value: "zh", label: "จีน (Chinese)" },
  { value: "ja", label: "ญี่ปุ่น (Japanese)" },
  { value: "ko", label: "เกาหลี (Korean)" },
  { value: "vi", label: "เวียดนาม (Vietnamese)" },
  { value: "id", label: "อินโดนีเซีย (Indonesian)" },
] as const;

export function labelForTarget(code: string): string {
  return TARGET_LANGUAGES.find((l) => l.value === code)?.label ?? code;
}
