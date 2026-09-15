const FONT_FAMILY = "Sarabun, 'Noto Sans Thai', sans-serif";

export async function renderThaiOverlay(dataUrl, blocks) {
  if (!dataUrl || !blocks?.length) return null;

  await document.fonts.load(`700 24px ${FONT_FAMILY}`).catch(() => {});
  await document.fonts.ready.catch(() => {});

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการวาดรูป");

  ctx.drawImage(image, 0, 0);

  const prepared = [];
  for (const block of blocks) {
    const text = (block.translation || "").trim();
    if (!text || block.unclear) continue;
    const box = toPixelBox(block, image.width, image.height);
    if (!box) continue;
    const inner = innerBox(box);
    prepared.push({
      block,
      box,
      inner,
      text,
    });
  }

  prepared.forEach((item) => {
    paintBlock(ctx, item.box, item.inner, item.text, item.block);
  });

  return canvas.toDataURL("image/jpeg", 0.92);
}

function toPixelBox(block, imageWidth, imageHeight) {
  const x = Number(block.x);
  const y = Number(block.y);
  const width = Number(block.width);
  const height = Number(block.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 0.012 || height < 0.012) return null;

  const inflateX = Math.min(0.012, width * 0.02 + 0.001);
  const inflateY = Math.min(0.012, height * 0.025 + 0.001);
  const left = Math.max(0, x - inflateX) * imageWidth;
  const top = Math.max(0, y - inflateY) * imageHeight;
  const right = Math.min(1, x + width + inflateX) * imageWidth;
  const bottom = Math.min(1, y + height + inflateY) * imageHeight;
  const w = right - left;
  const h = bottom - top;
  if (w < 8 || h < 8) return null;
  return { x: left, y: top, width: w, height: h };
}

function innerBox(box) {
  const padX = Math.max(4, box.width * 0.08);
  const padY = Math.max(4, box.height * 0.1);
  return {
    width: Math.max(8, box.width - padX * 2),
    height: Math.max(8, box.height - padY * 2),
  };
}

function paintBlock(ctx, box, inner, text, block) {
  const sampled = sampleEdgeColor(ctx, box);
  const backgroundHint = block.background === "dark" ? "dark" : block.background === "light" ? "light" : null;
  const luminance = (sampled.r * 299 + sampled.g * 587 + sampled.b * 114) / 1000;
  const isLight = backgroundHint ? backgroundHint === "light" : luminance >= 140;
  const fill = isLight
    ? mix(sampled, { r: 255, g: 255, b: 255 }, 0.35)
    : mix(sampled, { r: 20, g: 18, b: 16 }, 0.25);
  const ink = isLight ? "#1a1610" : "#f6f1e6";

  const radius =
    block.shape === "bubble"
      ? Math.min(box.width, box.height) * 0.22
      : Math.min(10, Math.min(box.width, box.height) * 0.12);

  ctx.save();
  roundedRect(ctx, box.x, box.y, box.width, box.height, radius);
  ctx.fillStyle = `rgb(${fill.r}, ${fill.g}, ${fill.b})`;
  ctx.fill();

  const target = Math.min(inner.height * 0.42, inner.width * 0.28, 96);
  const fitted = fitText(ctx, text, inner.width, inner.height, target);
  const totalH = fitted.lines.length * fitted.lineHeight;
  let startY = box.y + (box.height - totalH) / 2 + fitted.size * 0.8;

  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${fitted.size}px ${FONT_FAMILY}`;

  const centerX = box.x + box.width / 2;
  for (const line of fitted.lines) {
    ctx.fillText(line, centerX, startY, inner.width);
    startY += fitted.lineHeight;
  }
  ctx.restore();
}

function fitText(ctx, text, width, height, target) {
  let size = Math.floor(Math.min(target, height * 0.9));
  size = Math.max(9, size);
  let best = { size: 9, lines: wrapText(ctx, text, width, 9), lineHeight: 11 };

  while (size >= 9) {
    const lines = wrapText(ctx, text, width, size);
    const lineHeight = size * 1.18;
    const maxLine = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
    if (lines.length * lineHeight <= height && maxLine <= width) {
      return { size, lines, lineHeight };
    }
    best = { size, lines, lineHeight };
    size -= 1;
  }

  return best;
}

function wrapText(ctx, text, maxWidth, size) {
  ctx.font = `700 ${size}px ${FONT_FAMILY}`;
  const chunks = segmentForWrap(text);
  const lines = [];
  let current = "";

  for (const chunk of chunks) {
    const next = current + chunk;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current.trimEnd());
      current = chunk.trimStart();
      if (ctx.measureText(current).width > maxWidth && current.length > 8) {
        while (ctx.measureText(current).width > maxWidth && current.length > 2) {
          let cut = current.length - 1;
          while (cut > 1 && ctx.measureText(current.slice(0, cut)).width > maxWidth) {
            cut -= 1;
          }
          lines.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      }
    } else {
      current = next;
    }
  }

  if (current.trim()) lines.push(current.trimEnd());
  return lines.length ? lines : [text];
}

function segmentForWrap(text) {
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const parts = [];
      for (const { segment } of new Intl.Segmenter("th", { granularity: "word" }).segment(text)) {
        if (segment) parts.push(segment);
      }
      if (parts.length > 1) return parts;
    }
  } catch {
    /* ignore */
  }
  if (/\s/.test(text)) return text.split(/(\s+)/);
  return [text];
}

function sampleEdgeColor(ctx, box) {
  const colors = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pushPixel(ctx, colors, box.x + box.width * t, box.y + 1);
    pushPixel(ctx, colors, box.x + box.width * t, box.y + box.height - 2);
    pushPixel(ctx, colors, box.x + 1, box.y + box.height * t);
    pushPixel(ctx, colors, box.x + box.width - 2, box.y + box.height * t);
  }
  if (!colors.length) return { r: 255, g: 255, b: 255 };
  const sum = colors.reduce(
    (acc, color) => ({
      r: acc.r + color.r,
      g: acc.g + color.g,
      b: acc.b + color.b,
    }),
    { r: 0, g: 0, b: 0 },
  );
  return {
    r: Math.round(sum.r / colors.length),
    g: Math.round(sum.g / colors.length),
    b: Math.round(sum.b / colors.length),
  };
}

function pushPixel(ctx, colors, x, y) {
  const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(y)));
  const data = ctx.getImageData(px, py, 1, 1).data;
  colors.push({ r: data[0], g: data[1], b: data[2] });
}

function mix(a, b, amount) {
  return {
    r: Math.round(a.r * (1 - amount) + b.r * amount),
    g: Math.round(a.g * (1 - amount) + b.g * amount),
    b: Math.round(a.b * (1 - amount) + b.b * amount),
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("เปิดรูปเพื่อทับข้อความไม่สำเร็จ"));
    image.src = src;
  });
}
