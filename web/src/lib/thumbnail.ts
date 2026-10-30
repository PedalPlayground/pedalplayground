import { boardStyle, finishFlat, TOP_FLAT } from "./boardStyles";
import { DEFAULT_PEDAL_COLOR } from "./color";
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
      // Required for toDataURL() once images come from a CDN; the CDN must send Access-Control-Allow-Origin.
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

type Bounds = { left: number; top: number; right: number; bottom: number };

const layoutBounds = (items: Item[]): Bounds =>
  items.map(itemBounds).reduce((a, b) => ({
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }));

export async function loadItemImages(items: Item[]) {
  const manifest = await useCatalog.getState().load();
  return Promise.all(
    items.map((i) => {
      const url = i.image ? canvasImageUrl(manifest, i.kind, i.image) : null;
      return url ? loadImage(url) : null;
    }),
  );
}

export type Fit = { scale: number; ox: number; oy: number };

/** Fits the layout into the box (x, y, w, h): canvas px per layout px, and where the layout's origin lands. */
export function fitItems(items: Item[], box: { x: number; y: number; w: number; h: number }): Fit {
  const bounds = layoutBounds(items);
  const scale = Math.min(box.w / (bounds.right - bounds.left), box.h / (bounds.bottom - bounds.top));
  const ox = box.x + (box.w - (bounds.right - bounds.left) * scale) / 2 - bounds.left * scale;
  const oy = box.y + (box.h - (bounds.bottom - bounds.top) * scale) / 2 - bounds.top * scale;
  return { scale, ox, oy };
}

/** Draws the items onto the canvas at the given fit. */
export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], images: (HTMLImageElement | null)[], { scale, ox, oy }: Fit) {

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
    } else if (item.kind === "pedalboard") {
      // Flat colors of the board's frame and deck.
      const b = boardStyle(item.board);
      const bw = b.border ? Math.min(b.borderWidth * scale, w / 2, h / 2) : 0;
      if (bw) {
        ctx.fillStyle = finishFlat(b.finish);
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.fillStyle = TOP_FLAT[b.top];
      ctx.fillRect(-w / 2 + bw, -h / 2 + bw, w - bw * 2, h - bw * 2);
    } else {
      ctx.fillStyle = item.color ?? DEFAULT_PEDAL_COLOR;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "rgb(0 0 0 / 0.3)";
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  });
}

/** Renders a small WebP (PNG where WebP can't be encoded) data URL of the layout, or null if there's nothing to draw. */
export async function renderThumbnail(items: Item[]): Promise<string | null> {
  if (!items.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // Transparent background: the UI puts a light tint behind it that works on light and dark menus.
  drawItems(ctx, items, await loadItemImages(items), fitItems(items, { x: PAD, y: PAD, w: W - PAD * 2, h: H - PAD * 2 }));

  try {
    // WebP keeps the transparency and stays small. Browsers that can't encode it return PNG instead.
    return canvas.toDataURL("image/webp", 0.8);
  } catch {
    return null; // tainted canvas (cross-origin images without CORS)
  }
}
