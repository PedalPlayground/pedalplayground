export interface CatalogItem {
  brand: string;
  name: string;
  /** Inches */
  width: number;
  /** Inches */
  height: number;
  image: string;
}

export type Catalog = { pedals: CatalogItem[]; pedalboards: CatalogItem[] };

export type Rotation = 0 | 90 | 180 | 270;

/** An item placed on the canvas. Positions and sizes are in inches; z-order is array order. */
export interface Item {
  id: string;
  kind: "pedal" | "pedalboard";
  label: string;
  /** Catalog image filename, or null for custom items. */
  image: string | null;
  width: number;
  height: number;
  /** Top-left of the unrotated box, in inches. */
  x: number;
  y: number;
  rotation: Rotation;
  flipX: boolean;
  custom: boolean;
}

export interface View {
  /** Screen-space offset of the world origin, in px. */
  x: number;
  y: number;
  zoom: number;
}

/** What gets saved locally, exported, and (later) synced to the cloud. */
export interface PlaygroundDocument {
  schemaVersion: 3;
  savedAt: string;
  name: string;
  items: Item[];
  view?: View;
}

/** Legacy (jQuery app) v2 document. Read-only: we import it, never write it. */
export interface LegacyDocV2 {
  schemaVersion: number;
  multiplier: number;
  playgroundName: string | null;
  items: {
    type: "pedal" | "pedalboard";
    isCustom: boolean;
    title: string | null;
    width: number | null;
    height: number | null;
    rotationClass: "rotate-90" | "rotate-180" | "rotate-270" | null;
    artworkBackgroundImage: string | null;
    position: { left: number; top: number; translateX: number; translateY: number; useTransform: boolean };
    zOrder: number;
  }[];
}
