import logoSvg from "../assets/logo.svg?raw";
import { drawItems, fitItems, loadItemImages } from "./thumbnail";
import type { Item } from "./types";

/** The size Facebook, X, LinkedIn, iMessage, Slack and Discord all show as a large preview (1.91:1). */
export const SHARE_W = 1200;
export const SHARE_H = 630;

// The dark theme's canvas and dot grid colors (index.css).
const CANVAS = "#121316";
const GRID = "#2a2c34";
const TEXT = "#f2f2f4";

const SIDE = 64;
const TOP = 48;
/** Room under the layout for the name and the logo. */
const FOOTER = 112;
const LOGO_W = 288;
const LOGO_H = 18;

let logoPromise: Promise<HTMLImageElement | null> | null = null;

/** The logo in light ink, for the dark background. */
function loadLogo() {
  logoPromise ??= new Promise((resolve) => {
    const light = logoSvg.replace(/fill="(black|#2F2F31)"/g, `fill="${TEXT}"`);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(light)}`;
  });
  return logoPromise;
}

/** Shortens text with an ellipsis until it fits. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * The link preview for a shared playground: the layout on the dark canvas with its dot grid, the playground's name
 * and the logo. A JPEG, since every link previewer reads it and photos of pedals stay small. Null when the board is
 * empty or the images can't be read back (cross-origin without CORS).
 */
export async function renderShareImage(items: Item[], name: string): Promise<Blob | null> {
  if (!items.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d")!;

  const fit = fitItems(items, { x: SIDE, y: TOP, w: SHARE_W - SIDE * 2, h: SHARE_H - TOP - FOOTER });

  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  // The canvas's ½ in dot grid at this scale, anchored to the layout's origin like the app. Coarser when crowded.
  let step = 0.5 * fit.scale; // layout units are inches
  while (step < 12) step *= 2;
  ctx.fillStyle = GRID;
  const x0 = ((fit.ox % step) + step) % step;
  const y0 = ((fit.oy % step) + step) % step;
  for (let y = y0; y < SHARE_H; y += step) {
    for (let x = x0; x < SHARE_W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const [images, logo] = await Promise.all([loadItemImages(items), loadLogo()]);

  // A soft shadow lifts the gear off the canvas.
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 0.55)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  drawItems(ctx, items, images, fit);
  ctx.restore();

  // Footer: fade the grid out behind the text, then the name on the left and the logo on the right.
  const fade = ctx.createLinearGradient(0, SHARE_H - FOOTER - 8, 0, SHARE_H);
  fade.addColorStop(0, "rgb(18 19 22 / 0)");
  fade.addColorStop(0.45, CANVAS);
  ctx.fillStyle = fade;
  ctx.fillRect(0, SHARE_H - FOOTER - 8, SHARE_W, FOOTER + 8);

  const baseline = SHARE_H - 46;
  if (document.fonts) await document.fonts.load('600 40px "DM Sans"').catch(() => undefined);
  ctx.font = '600 40px "DM Sans", ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fitText(ctx, name.trim() || "Pedalboard", SHARE_W - SIDE * 2 - LOGO_W - 48), SIDE, baseline);
  if (logo) ctx.drawImage(logo, SHARE_W - SIDE - LOGO_W, baseline - LOGO_H - 4, LOGO_W, LOGO_H);

  try {
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  } catch {
    return null; // tainted canvas
  }
}
