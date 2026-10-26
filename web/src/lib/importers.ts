import { DEFAULT_PEDAL_COLOR } from "./color";
import { PX_PER_INCH } from "./geometry";
import type { Item, LegacyDocV2, PlaygroundDocument, Rotation } from "./types";

const newId = () => crypto.randomUUID();

const ROTATION: Record<string, Rotation> = { "rotate-90": 90, "rotate-180": 180, "rotate-270": 270 };

function imageFromCss(bg: string | null): { image: string; kind: "pedal" | "pedalboard" } | null {
  const m = bg?.match(/url\(["']?([^"')]+)["']?\)/);
  if (!m) return null;
  const path = m[1];
  const file = decodeURIComponent(path.split("/").pop() ?? "");
  return file ? { image: file, kind: path.includes("/pedalboards/") ? "pedalboard" : "pedal" } : null;
}

export function fromLegacyV2(doc: LegacyDocV2): PlaygroundDocument {
  const scale = doc.multiplier > 0 ? doc.multiplier : PX_PER_INCH;
  const items: Item[] = [...doc.items]
    .sort((a, b) => a.zOrder - b.zOrder)
    .map((it) => {
      const art = imageFromCss(it.artworkBackgroundImage);
      const p = it.position;
      const left = p.left + (p.useTransform ? p.translateX : 0);
      const top = p.top + (p.useTransform ? p.translateY : 0);
      return {
        id: newId(),
        kind: art?.kind ?? it.type,
        label: it.title ?? "",
        image: it.isCustom ? null : (art?.image ?? null),
        width: it.width ?? 0,
        height: it.height ?? 0,
        x: left / scale,
        y: top / scale,
        rotation: it.rotationClass ? ROTATION[it.rotationClass] : 0,
        flipX: false,
        custom: it.isCustom || !art,
        color: it.isCustom && it.type === "pedal" ? (it.color ?? DEFAULT_PEDAL_COLOR) : null,
      };
    })
    .filter((i) => i.width > 0 && i.height > 0);
  return {
    schemaVersion: 3,
    savedAt: new Date().toISOString(),
    name: doc.playgroundName?.trim() || "Imported Playground",
    items,
  };
}

/** Best-effort parse of the original HTML-blob save (`pedalCanvas`). */
export function fromLegacyHtml(html: string): PlaygroundDocument {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const multiplier = parseFloat((dom.querySelector("#multiplier") as HTMLInputElement | null)?.value ?? "") || PX_PER_INCH;
  const items: LegacyDocV2["items"] = [];

  dom.querySelectorAll<HTMLElement>(".item").forEach((el, index) => {
    const style = el.getAttribute("style") ?? "";
    const num = (prop: string) => parseFloat(style.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*(-?[\\d.]+)px`))?.[1] ?? "0") || 0;
    const t = style.match(/translate(?:3d)?\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
    const art = el.querySelector<HTMLElement>(".artwork");
    const rotationClass = (["rotate-270", "rotate-180", "rotate-90"] as const).find((c) => el.classList.contains(c)) ?? null;
    items.push({
      type: el.classList.contains("pedalboard") ? "pedalboard" : "pedal",
      isCustom: el.classList.contains("pedal--custom") || el.classList.contains("pedalboard--custom"),
      title: el.getAttribute("title"),
      width: parseFloat(el.getAttribute("data-width") ?? "") || null,
      height: parseFloat(el.getAttribute("data-height") ?? "") || null,
      rotationClass,
      artworkBackgroundImage: art?.getAttribute("style")?.match(/background-image:\s*([^;]+)/)?.[1] ?? null,
      color: el.querySelector(".pedal__box")?.getAttribute("style")?.match(/background-color:\s*([^;]+)/)?.[1]?.trim() ?? null,
      position: { left: num("left"), top: num("top"), translateX: t ? +t[1] : 0, translateY: t ? +t[2] : 0, useTransform: !!t },
      zOrder: index,
    });
  });

  return fromLegacyV2({ schemaVersion: 1, multiplier, playgroundName: null, items });
}

/** Accepts our v3 doc, a legacy v2 doc, or a legacy export file ({ document, canvas }). */
export function importAny(raw: unknown): PlaygroundDocument {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") throw new Error("Not a playground file.");
  if (o.schemaVersion === 3 && Array.isArray(o.items)) {
    const doc = o as unknown as PlaygroundDocument;
    return { ...doc, items: doc.items.map((it) => ({ ...it, color: it.color ?? null })) };
  }
  if (o.document && typeof o.document === "object") return importAny(o.document);
  if (Array.isArray(o.items) && "multiplier" in o) return fromLegacyV2(o as unknown as LegacyDocV2);
  if (typeof o.canvas === "string") return fromLegacyHtml(o.canvas);
  throw new Error("Unrecognized playground file.");
}

/** Reads the jQuery app's localStorage, if present on this origin. */
export function readLegacyLocalStorage(): PlaygroundDocument | null {
  try {
    const v2 = localStorage.getItem("pedalPlaygroundDocV2");
    if (v2) return fromLegacyV2(JSON.parse(v2));
    const html = localStorage.getItem("pedalCanvas");
    if (html) return fromLegacyHtml(JSON.parse(html));
  } catch {
    /* malformed or unavailable */
  }
  return null;
}
