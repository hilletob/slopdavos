// The brands' logos (assets/logos/, sources and licences in assets/logos/SOURCES.md): an index of logo files with the
// sign names they belong to, loaded once; images load on demand. Everything here is asynchronous and optional: callers
// draw their own lettering first and swap the logo in when (and if) it arrives.

const BASE = new URL('../assets/logos/', import.meta.url);
let indexPromise = null;

// { key: { file, aspect, match (RegExp), background?, tint? } } from index.json and index-part2.json (the first wins)
export function logoIndex() {
  indexPromise ??= Promise.all(['index.json', 'index-part2.json'].map((f) =>
    fetch(new URL(f, BASE)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  )).then((parts) => {
    const out = {};
    for (const part of parts) {
      for (const [key, e] of Object.entries(part?.logos || part || {})) {
        if (out[key] || !e?.file) continue;
        out[key] = { ...e, match: e.match ? new RegExp(e.match, 'i') : null };
      }
    }
    return out;
  });
  return indexPromise;
}

// The logo entry for a sign text / business name, or null
export function logoFor(index, ...names) {
  for (const e of Object.values(index)) if (e.match && names.some((n) => n && e.match.test(n))) return e;
  return null;
}

const images = new Map();
// The logo's image (an <img> decoded and ready for drawImage)
export function logoImage(entry) {
  if (!images.has(entry.file)) {
    images.set(entry.file, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`logo ${entry.file}`));
      img.src = new URL(entry.file, BASE).href;
    }));
  }
  return images.get(entry.file);
}

// Draws `img` into the box (x, y, w, h) of a 2D context, keeping its aspect (`aspect` from the index: SVGs without
// intrinsic size), centred; `tint` recolours every opaque pixel (e.g. white on a coloured body)
export function drawLogo(ctx, img, aspect, x, y, w, h, { tint = null, pad = 0 } = {}) {
  const bw = w - 2 * pad, bh = h - 2 * pad;
  let dw = bw, dh = bw / aspect;
  if (dh > bh) { dh = bh; dw = bh * aspect; }
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  if (!tint) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(dw)); c.height = Math.max(1, Math.ceil(dh));
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(c, dx, dy, dw, dh);
}
