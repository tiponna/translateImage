const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.86;
const MAX_OUTPUT_BYTES = 4.5 * 1024 * 1024;

export async function prepareImageFromDataUrl(dataUrl, name = "image.jpg") {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return prepareImageFile(new File([blob], name, { type: blob.type || "image/jpeg" }));
}

export async function prepareImageFile(file) {
  if (!(file instanceof Blob)) {
    throw new Error("ไม่พบไฟล์รูปภาพ");
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error("ไฟล์ใหญ่เกินไป (สูงสุด 20MB)");
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("เปิดรูปนี้ไม่ได้ ลองใช้ JPEG หรือ PNG");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = JPEG_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (estimateDataUrlBytes(dataUrl) > MAX_OUTPUT_BYTES && quality > 0.5) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (estimateDataUrlBytes(dataUrl) > MAX_OUTPUT_BYTES) {
    throw new Error("รูปยังใหญ่เกินไปหลังย่อขนาดแล้ว");
  }

  return {
    dataUrl,
    width,
    height,
    name: "name" in file && typeof file.name === "string" ? file.name : "image.jpg",
  };
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}
