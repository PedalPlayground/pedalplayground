import type { BoardStyle } from "./boardStyles";
import type { Jacks, PedalTemplate } from "./pedalTemplates";
import type { SignalGraph } from "./signal";

export interface CatalogItem {
  brand: string;
  name: string;
  /** Inches */
  width: number;
  /** Inches */
  height: number;
  image: string;
  /** Optional pedal specs from the catalog: current draw in mA, supply voltage (e.g. "9V DC"), and pedal type. */
  ma?: number;
  voltage?: string;
  type?: string;
  /** The day it joined the catalog, "YYYY-MM-DD" (from git history at build time). */
  added?: string;
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
  /** Body color for custom pedals (hex); null for catalog items and custom boards. */
  color: string | null;
  /** Custom pedals: which look to draw (see pedalTemplates). Missing means Classic, the look from before templates. */
  template?: PedalTemplate;
  /** Custom pedals: edges with jacks sticking out. width and height include them. Missing means none. */
  jacks?: Jacks;
  /** Custom pedalboards: border, thickness, top surface and border finish. Missing means the original look. */
  board?: Partial<BoardStyle>;
  /** Grouped items share a groupId: selecting one selects them all, so they move and edit together. */
  groupId?: string;
  /** Locked items stay put: they can be selected but not dragged, nudged or distributed. */
  locked?: boolean;
  /** Equipment List: "wanted" means the user still needs to buy it. Missing means they own it. */
  status?: "owned" | "wanted";
  /** Equipment List: price in US dollars (what they paid, or what it costs to buy). */
  price?: number;
  /** Equipment List pedal specs: current draw in mA, supply voltage ("9V DC"), and pedal type ("Delay"). */
  ma?: number;
  voltage?: string;
  pedalType?: string;
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
  /** How the pedals are wired. Missing in documents saved before the Signal Path mode; they get the default. */
  signal?: SignalGraph;
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
    /** Only present when read from the original HTML save. */
    color?: string | null;
  }[];
}
