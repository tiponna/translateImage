const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 12 * 1024 * 1024;

export function assertSafeImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL รูปภาพไม่ถูกต้อง");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ใช้ได้เฉพาะ URL ที่ขึ้นต้นด้วย http หรือ https");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    isPrivateHostname(host)
  ) {
    throw new Error("ไม่สามารถดึงรูปจากที่อยู่นี้ได้");
  }

  return url;
}

export async function fetchImageAsDataUrl(value) {
  const url = assertSafeImageUrl(value);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "image/jpeg,image/png,image/webp,image/gif,image/*;q=0.8",
      "User-Agent": "PhapPlae/1.0 (image translator)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error("ดึงรูปจาก URL ไม่สำเร็จ");
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType && !ALLOWED_TYPES.has(contentType) && !contentType.startsWith("image/")) {
    throw new Error("URL นี้ไม่ใช่ไฟล์รูปภาพ");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("ไฟล์จาก URL ใหญ่เกินไป (สูงสุด 12MB)");
  }

  const mime = ALLOWED_TYPES.has(contentType)
    ? contentType === "image/jpg"
      ? "image/jpeg"
      : contentType
    : sniffImageMime(buffer);

  if (!mime) {
    throw new Error("ไม่รองรับชนิดไฟล์จาก URL นี้");
  }

  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function isPrivateHostname(host) {
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

function sniffImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  return null;
}
