import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // รองรับอัปโหลดรูปสูงสุด ~10MB
  // tesseract.js / sharp ใช้ native — ต้องไม่ให้ Turbopack bundle
  serverExternalPackages: ["tesseract.js", "sharp"],
};

export default nextConfig;
