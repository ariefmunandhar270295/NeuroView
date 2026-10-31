/** Teks overlay HTML yang ikut digambar (selain canvas dan SVG). */
const TEXT_SELECTORS = '.viewport-overlay > div, .vr-label, .vr-status, .probe-title, .probe-info';
const FOOTER_HEIGHT = 22;

const isVisible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** Salin gaya teks hasil CSS ke atribut agar tetap sama saat SVG dirender sebagai gambar terpisah. */
function inlineSvg(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = svg.querySelectorAll('*');
  const copies = clone.querySelectorAll('*');
  originals.forEach((original, i) => {
    const copy = copies[i] as SVGElement;
    const cs = getComputedStyle(original);
    // Elemen yang disembunyikan CSS (mis. handle rotasi crosshair) jangan ikut tergambar.
    if (cs.display === 'none') {
      copy.remove();
      return;
    }
    if (original instanceof SVGTextElement) {
      copy.setAttribute(
        'style',
        `font: ${cs.font}; fill: ${cs.fill}; stroke: ${cs.stroke}; stroke-width: ${cs.strokeWidth}; paint-order: ${cs.paintOrder};`,
      );
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(clone);
}

async function drawSvg(ctx: CanvasRenderingContext2D, svg: SVGSVGElement, x: number, y: number, w: number, h: number) {
  const url = URL.createObjectURL(new Blob([inlineSvg(svg, w, h)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    ctx.drawImage(image, x, y, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: HTMLElement, originX: number, originY: number) {
  const text = el.innerText.trim();
  if (!text) return;
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const fontSize = parseFloat(cs.fontSize);
  const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.4;
  const alignRight = cs.textAlign === 'right' || cs.textAlign === 'end';
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  const x = (alignRight ? rect.right : rect.left) - originX;
  text.split('\n').forEach((line, i) => {
    const y = rect.top - originY + lineHeight * i + (lineHeight + fontSize * 0.7) / 2;
    ctx.fillText(line, x, y);
    ctx.fillText(line, x, y); // dua kali agar bayangan setebal text-shadow di layar
  });
  ctx.shadowBlur = 0;
}

/**
 * Gabungkan isi viewport yang terlihat menjadi satu PNG: canvas Cornerstone (citra, MPR, 3D),
 * layer SVG (anotasi Cornerstone, overlay rencana trajektori), dan teks overlay. Tombol, slider,
 * dan kontrol lain tidak ikut. Di bawahnya ditambahkan pita dengan `footer` (mis. disclaimer).
 */
export async function captureViewportPng(container: HTMLElement, footer: string): Promise<Blob> {
  const box = container.getBoundingClientRect();
  if (!box.width || !box.height) throw new Error('Viewport tidak terlihat');
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round((box.height + FOOTER_HEIGHT) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const background = getComputedStyle(container).backgroundColor;
  ctx.fillStyle = background && background !== 'rgba(0, 0, 0, 0)' ? background : '#000';
  ctx.fillRect(0, 0, box.width, box.height);

  for (const source of container.querySelectorAll('canvas')) {
    if (!isVisible(source) || !source.width) continue;
    const r = source.getBoundingClientRect();
    ctx.drawImage(source, r.left - box.left, r.top - box.top, r.width, r.height);
  }
  for (const svg of container.querySelectorAll('svg')) {
    if (!isVisible(svg) || !svg.childElementCount) continue;
    const r = svg.getBoundingClientRect();
    await drawSvg(ctx, svg, r.left - box.left, r.top - box.top, r.width, r.height);
  }
  for (const el of container.querySelectorAll<HTMLElement>(TEXT_SELECTORS)) {
    if (isVisible(el)) drawText(ctx, el, box.left, box.top);
  }

  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, box.height, box.width, FOOTER_HEIGHT);
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#8b98a8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(footer, 8, box.height + FOOTER_HEIGHT / 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat PNG'))), 'image/png'),
  );
}
