import { itemBounds } from "./geometry";
import { canvasImageUrl } from "./catalog";
import { useCatalog } from "../store/catalog";
import type { Item } from "./types";

const W = 360;
const H = 225;
const PAD = 16;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string) {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

/** Renders a small JPEG data URL of the layout, or null if there's nothing to draw. */
export async function renderThumbnail(items: Item[]): Promise<string | null> {
  if (!items.length) return null;

  const bounds = items.map(itemBounds).reduce((a, b) => ({
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }));
  const scale = Math.min((W - PAD * 2) / (bounds.right - bounds.left), (H - PAD * 2) / (bounds.bottom - bounds.top));
  const ox = (W - (bounds.right - bounds.left) * scale) / 2 - bounds.left * scale;
  const oy = (H - (bounds.bottom - bounds.top) * scale) / 2 - bounds.top * scale;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, W, H);

  const manifest = await useCatalog.getState().load();
  const images = await Promise.all(
    items.map((i) => {
      const url = i.image ? canvasImageUrl(manifest, i.kind, i.image) : null;
      return url ? loadImage(url) : null;
    }),
  );

  items.forEach((item, n) => {
    const w = item.width * scale;
    const h = item.height * scale;
    ctx.save();
    ctx.translate(ox + (item.x + item.width / 2) * scale, oy + (item.y + item.height / 2) * scale);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.scale(item.flipX ? -1 : 1, 1);
    const img = images[n];
    if (img) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = item.kind === "pedalboard" ? "#d8dae0" : "#ffffff";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "#9a9ea9";
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  });

  try {
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null; // tainted canvas (cross-origin images without CORS)
  }
}
