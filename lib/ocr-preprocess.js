export async function enhanceForOcr(dataUrl, maxEdge = 1600, { binary = false, invert = false } = {}) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการปรับรูป OCR");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  stretchContrast(ctx, width, height, { binary, invert });
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
    scale,
  };
}

export async function cropAndBinarize(dataUrl, block) {
  return cropForOcr(dataUrl, block, { binary: false });
}

export async function cropForOcr(dataUrl, block, { binary = false } = {}) {
  const image = await loadImage(dataUrl);
  const padX = Math.max(block.width * 0.12, 0.01);
  const padY = Math.max(block.height * 0.16, 0.01);
  const left = Math.max(0, (block.x - padX) * image.width);
  const top = Math.max(0, (block.y - padY) * image.height);
  const right = Math.min(image.width, (block.x + block.width + padX) * image.width);
  const bottom = Math.min(image.height, (block.y + block.height + padY) * image.height);
  const width = Math.max(8, Math.round(right - left));
  const height = Math.max(8, Math.round(bottom - top));
  const scale = Math.max(1, 64 / height);
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error("ครอปข้อความไม่สำเร็จ");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, left, top, width, height, 0, 0, outW, outH);
  stretchContrast(ctx, outW, outH, { binary, invert: false });
  return canvas.toDataURL("image/jpeg", 0.92);
}

function stretchContrast(ctx, width, height, { binary, invert }) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const count = width * height;
  const gray = new Uint8Array(count);
  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  const sorted = Array.from(gray).sort((a, b) => a - b);
  const low = sorted[Math.floor(count * 0.02)] ?? 0;
  const high = sorted[Math.min(count - 1, Math.floor(count * 0.98))] ?? 255;
  const span = Math.max(1, high - low);

  for (let p = 0; p < count; p += 1) {
    gray[p] = Math.max(0, Math.min(255, Math.round(((gray[p] - low) / span) * 255)));
  }

  if (binary) {
    const cut = otsu(gray);
    for (let p = 0; p < count; p += 1) {
      gray[p] = gray[p] >= cut ? 255 : 0;
    }
  }

  let dark = 0;
  for (let p = 0; p < count; p += 1) {
    if (gray[p] < 128) dark += 1;
  }
  const shouldInvert = invert || dark / count > 0.62;
  if (shouldInvert) {
    for (let p = 0; p < count; p += 1) gray[p] = 255 - gray[p];
  }

  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    const value = gray[p];
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

export async function looksLikeManga(dataUrl) {
  const image = await loadImage(dataUrl);
  const width = 140;
  const height = Math.max(80, Math.round((140 * image.height) / image.width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) return false;
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let black = 0;
  let white = 0;
  let gutterRows = 0;
  const total = width * height;

  for (let y = 0; y < height; y += 1) {
    let whiteInRow = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      if (gray < 45) black += 1;
      else if (gray > 215) {
        white += 1;
        whiteInRow += 1;
      }
    }
    if (whiteInRow / width > 0.88) gutterRows += 1;
  }

  const blackRatio = black / total;
  const whiteRatio = white / total;
  const midRatio = 1 - blackRatio - whiteRatio;
  const gutterRatio = gutterRows / height;
  return (
    blackRatio > 0.1 &&
    whiteRatio > 0.22 &&
    midRatio < 0.45 &&
    gutterRatio > 0.035 &&
    gutterRatio < 0.35
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("เปิดรูปเพื่อปรับ OCR ไม่สำเร็จ"));
    image.src = src;
  });
}
