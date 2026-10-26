import { createContext, useContext, useId, type ReactNode } from "react";
import { DEFAULT_PEDAL_COLOR, luminance, readableOn, shade } from "../lib/color";
import { PX_PER_INCH as IN } from "../lib/geometry";
import type { PedalTemplate } from "../lib/pedalTemplates";

/*
 * Custom pedal artwork in a soft 3D style: lit from above, with gradients for form, crisp dark outlines and thin
 * highlight edges for definition, and soft contact shadows. Every template lays itself out in code at the pedal's
 * real size (in canvas px), so knobs and footswitches keep their shape while their spacing, and sometimes their
 * count, follow the size.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `n` evenly spaced centers across [a, b]. */
const spread = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);

/** Hardware colors, shared by every template. */
const HW = {
  edge: "#0d0e10",
  pointer: "#f6f4ee",
  pointerDark: "#22252a",
  led: "#ff3b2f",
  lcd: "#0e1726",
  lcdGlow: "#5eb3ff",
};

/** LED colors cycled across a row of switches. */
const LED_COLORS = ["#ff3b2f", "#ffb020", "#2bd96b", "#3d8bff", "#b26bff", "#ff4fa3"];

/** Per-pedal prefix for gradient and filter ids, so many pedals on one page don't collide. */
const Ids = createContext("pp");
const useUrl = () => {
  const id = useContext(Ids);
  return (name: string) => `url(#${id}-${name})`;
};

type LabelBox = { x: number; y: number; w: number; h: number; align?: "left" | "center"; ink?: string };
type Layout = { parts: ReactNode; label: LabelBox | null };
/** `dark` is true on very dark bodies, where knobs switch to the cream style so they still stand out. */
type Draw = (w: number, h: number, u: number, color: string, dark: boolean) => Layout;

/** A soft contact shadow under a round part. */
function Shadow({ cx, cy, r, drop = 0.14, opacity = 0.45 }: { cx: number; cy: number; r: number; drop?: number; opacity?: number }) {
  const url = useUrl();
  return <ellipse cx={cx} cy={cy + r * drop} rx={r * 1.02} ry={r * 1.04} fill="#000" opacity={opacity} filter={url("blur")} />;
}

/** A knob: a dark skirt and domed cap with a bright pointer, or with `light`, a cream knob with a dark pointer. */
function Knob({ cx, cy, r, turn = 0, light }: { cx: number; cy: number; r: number; turn?: number; light?: boolean }) {
  const url = useUrl();
  // Pointer angle varies by `turn` so a row of knobs doesn't look stamped.
  const a = ((-135 + ((turn * 67) % 270)) * Math.PI) / 180;
  const cap = r * 0.74;
  const edge = Math.max(0.6, r * 0.045);
  const at = (k: number) => ({ x: cx + Math.sin(a) * r * k, y: cy - Math.cos(a) * r * k });
  const p1 = at(0.12);
  const p2 = at(0.68);
  const tip = at(0.92);
  return (
    <g>
      <Shadow cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r} fill={url(light ? "skirtL" : "skirt")} stroke={HW.edge} strokeWidth={edge} />
      <circle cx={cx} cy={cy} r={cap} fill={url(light ? "capL" : "cap")} stroke={light ? "#8d8a84" : "#050506"} strokeWidth={edge * 0.8} />
      <circle cx={cx} cy={cy} r={cap - edge} fill="none" stroke={url("rim")} strokeWidth={edge} />
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={light ? HW.pointerDark : HW.pointer} strokeWidth={Math.max(1, r * 0.12)} strokeLinecap="round" />
      {/* A notch on the skirt, lined up with the pointer. */}
      <circle cx={tip.x} cy={tip.y} r={Math.max(0.5, r * 0.05)} fill={light ? HW.pointerDark : HW.pointer} />
    </g>
  );
}

/** Points of a regular `n`-gon, as an SVG points string. */
function polygon(cx: number, cy: number, r: number, n: number, rot = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n - Math.PI / 2;
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");
}

/** A footswitch: a chrome hex nut around a domed metal button. */
function Footswitch({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const url = useUrl();
  const edge = Math.max(0.6, r * 0.04);
  return (
    <g>
      <Shadow cx={cx} cy={cy} r={r} drop={0.16} opacity={0.5} />
      <polygon points={polygon(cx, cy, r, 6, Math.PI / 6)} fill={url("chrome")} stroke="#3a3d42" strokeWidth={edge} strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r * 0.68} fill={url("button")} stroke="#4b4f56" strokeWidth={edge} />
      <circle cx={cx} cy={cy} r={r * 0.68 - edge * 1.5} fill="none" stroke={url("rim")} strokeWidth={edge} />
      <ellipse cx={cx - r * 0.18} cy={cy - r * 0.22} rx={r * 0.22} ry={r * 0.12} fill="#fff" opacity={0.7} />
    </g>
  );
}

/** An LED in a dark bezel, with a soft glow. */
function Led({ cx, cy, r, on = HW.led }: { cx: number; cy: number; r: number; on?: string }) {
  const url = useUrl();
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 2.6} fill={on} opacity={0.45} filter={url("glow")} />
      <circle cx={cx} cy={cy} r={r * 1.45} fill="#1a1b1e" stroke="#000" strokeWidth={Math.max(0.4, r * 0.12)} />
      <circle cx={cx} cy={cy} r={r} fill={on} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.32} r={r * 0.36} fill="#fff" opacity={0.85} />
    </g>
  );
}

function Toggle({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  const url = useUrl();
  const edge = Math.max(0.5, s * 0.06);
  return (
    <g>
      <Shadow cx={cx} cy={cy} r={s * 0.55} />
      <circle cx={cx} cy={cy} r={s * 0.55} fill={url("chrome")} stroke="#3a3d42" strokeWidth={edge} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s} stroke="#3a3d42" strokeWidth={s * 0.36 + edge * 2} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s} stroke={url("chromeH")} strokeWidth={s * 0.36} strokeLinecap="round" />
      <circle cx={cx} cy={cy - s} r={s * 0.26} fill={url("button")} stroke="#3a3d42" strokeWidth={edge} />
    </g>
  );
}

/** Input and output jacks on the sides. */
function SideJacks({ w, y, u }: { w: number; y: number; u: number }) {
  const url = useUrl();
  const jw = u * 0.06;
  const jh = u * 0.2;
  const edge = Math.max(0.5, u * 0.008);
  return (
    <g fill={url("chrome")} stroke="#3a3d42" strokeWidth={edge}>
      <rect x={-edge} y={y} width={jw + edge} height={jh} rx={jw * 0.25} />
      <rect x={w - jw} y={y} width={jw + edge} height={jh} rx={jw * 0.25} />
    </g>
  );
}

/** A groove pressed into the body: a dark line over a light one. */
function Groove({ x1, x2, y, u }: { x1: number; x2: number; y: number; u: number }) {
  const sw = Math.max(0.6, u * 0.012);
  return (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke="#000" strokeOpacity={0.4} strokeWidth={sw} />
      <line x1={x1} x2={x2} y1={y + sw} y2={y + sw} stroke="#fff" strokeOpacity={0.35} strokeWidth={sw} />
    </g>
  );
}

/** Boss-style compact: knobs on top, a groove, the name, and a treadle with a ribbed rubber pad. */
const compact: Draw = (w, h, u, color, dark) => {
  const n = clamp(Math.round(w / (0.72 * IN)), 1, 6);
  const knobZone = h * 0.3;
  const r = Math.min(((w * 0.88) / n) * 0.36, knobZone * 0.32);
  const grooveY = h * 0.36;
  const tx = w * 0.06;
  const ty = h * 0.56;
  const tw = w * 0.88;
  const th = h * 0.4;
  const padY = ty + th * 0.5;
  const padH = th * 0.42;
  const ribs = Math.max(3, Math.floor(padH / (0.14 * IN)));
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.16} u={u} />
        {spread(n, w * 0.06, w * 0.94).map((cx, i) => (
          <Knob key={i} cx={cx} cy={h * 0.04 + knobZone * 0.45} r={r} turn={i} light={dark} />
        ))}
        <Led cx={w / 2} cy={grooveY - u * 0.06} r={u * 0.025} />
        <Groove x1={0} x2={w} y={grooveY} u={u} />
        <TreadleParts x={tx} y={ty} w={tw} h={th} u={u} color={color} padY={padY} padH={padH} ribs={ribs} />
      </>
    ),
    label: { x: w * 0.07, y: grooveY + h * 0.02, w: w * 0.86, h: ty - grooveY - h * 0.035 },
  };
}

/** The treadle: a raised plate in the body color, with a ribbed black rubber pad. */
function TreadleParts({
  x,
  y,
  w,
  h,
  u,
  color,
  padY,
  padH,
  ribs,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  color: string;
  padY: number;
  padH: number;
  ribs: number;
}) {
  const url = useUrl();
  const rx = u * 0.035;
  const edge = Math.max(0.6, u * 0.01);
  const px = x + w * 0.07;
  const pw = w * 0.86;
  return (
    <g>
      <rect x={x} y={y + u * 0.025} width={w} height={h} rx={rx} fill="#000" opacity={0.45} filter={url("blur")} />
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={url("treadle")} stroke={shade(color, -0.55)} strokeWidth={edge} />
      <rect x={x + edge} y={y + edge} width={w - edge * 2} height={h - edge * 2} rx={rx - edge} fill="none" stroke={url("hl")} strokeWidth={edge} />
      <rect x={px} y={padY} width={pw} height={padH} rx={u * 0.02} fill={url("rubber")} stroke="#000" strokeWidth={edge} />
      {spread(ribs, padY, padY + padH).map((ry, i) => (
        <g key={i}>
          <line x1={px + pw * 0.05} x2={px + pw * 0.95} y1={ry} y2={ry} stroke="#000" strokeWidth={Math.max(0.8, u * 0.018)} strokeLinecap="round" />
          <line x1={px + pw * 0.05} x2={px + pw * 0.95} y1={ry + Math.max(0.8, u * 0.016)} y2={ry + Math.max(0.8, u * 0.016)} stroke="#fff" strokeOpacity={0.14} strokeWidth={Math.max(0.6, u * 0.01)} strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

/** A small Hammond enclosure (1590B / 125B): a grid of knobs, the name, an LED and one footswitch. */
const hammond: Draw = (w, h, u, _color, dark) => {
  const top = h * 0.06;
  const zoneH = h * 0.44;
  const cols = clamp(Math.floor(w / (0.8 * IN)), 1, 4);
  const rows = clamp(Math.floor(zoneH / (0.85 * IN)), 1, 3);
  const cellW = (w * 0.9) / cols;
  const cellH = zoneH / rows;
  const r = Math.min(cellW, cellH, IN) * 0.34;
  const fsR = Math.min(u * 0.17, 0.34 * IN);
  const fsY = h * 0.93 - fsR;
  const ledY = fsY - fsR - u * 0.11;
  const knobs: ReactNode[] = [];
  for (let ri = 0; ri < rows; ri++) {
    // A last row one knob short, centered under the others, reads like a real layout.
    const n = rows > 1 && ri === rows - 1 && cols >= 3 ? cols - 1 : cols;
    const inset = ((cols - n) * cellW) / 2;
    spread(n, w * 0.05 + inset, w * 0.95 - inset).forEach((cx, i) =>
      knobs.push(<Knob key={`${ri}-${i}`} cx={cx} cy={top + cellH * (ri + 0.5)} r={r} turn={ri * 3 + i} light={dark} />),
    );
  }
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.22} u={u} />
        {knobs}
        <Led cx={w / 2} cy={ledY} r={u * 0.032} />
        <Footswitch cx={w / 2} cy={fsY} r={fsR} />
      </>
    ),
    label: { x: w * 0.06, y: top + zoneH + u * 0.02, w: w * 0.88, h: Math.max(0, ledY - u * 0.08 - (top + zoneH + u * 0.02)) },
  };
};

/** A wide Hammond enclosure (1590BB), Chase Bliss / Walrus style: knobs in rows, toggles, and two footswitches. */
const wide: Draw = (w, h, u, _color, dark) => {
  const labelH = h * 0.14;
  const top = h * 0.04 + labelH + h * 0.02;
  const zoneH = h * 0.38;
  const cols = clamp(Math.floor(w / (1.4 * IN)), 2, 8);
  const rows = clamp(Math.floor(zoneH / (0.62 * IN)), 1, 2);
  const cellW = (w * 0.9) / cols;
  const cellH = zoneH / rows;
  const r = Math.min(cellW, cellH, IN) * 0.32;
  const s = Math.min(u * 0.1, 0.18 * IN);
  const toggleY = top + zoneH + h * 0.08;
  const nF = w >= 7.5 * IN ? 3 : w >= 3.4 * IN ? 2 : 1;
  const fsR = Math.min(u * 0.14, (w / nF) * 0.2, 0.3 * IN);
  const fsY = h * 0.95 - fsR;
  const fx = spread(nF, w * 0.05, w * 0.95);
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.3} u={u} />
        {Array.from({ length: rows }, (_, ri) =>
          spread(cols, w * 0.05, w * 0.95).map((cx, i) => (
            <Knob key={`${ri}-${i}`} cx={cx} cy={top + cellH * (ri + 0.5)} r={r} turn={ri * cols + i} light={dark} />
          )),
        )}
        {spread(cols, w * 0.12, w * 0.88).map((cx, i) => (
          <Toggle key={i} cx={cx} cy={toggleY} s={s} />
        ))}
        {fx.map((cx, i) => (
          <Led key={i} cx={cx + fsR * 1.75} cy={fsY - fsR * 0.75} r={u * 0.028} on={LED_COLORS[i]} />
        ))}
        {fx.map((cx, i) => (
          <Footswitch key={i} cx={cx} cy={fsY} r={fsR} />
        ))}
      </>
    ),
    label: { x: w * 0.06, y: h * 0.04, w: w * 0.88, h: labelH },
  };
};

/** A digital modeler or multi-effect: a dark glass panel with a glowing screen and knobs, then footswitches. */
const modeler: Draw = (w, h, u) => {
  const sw = Math.min(w * 0.36, h * 0.32 * 1.78);
  const sh = sw * 0.5;
  const sx = (w - sw) / 2;
  const sy = h * 0.06;
  const nK = clamp(Math.floor((w * 0.84) / (0.75 * IN)), 3, 8);
  const kr = Math.min(0.2 * IN, u * 0.065);
  const ky = sy + sh + kr + h * 0.045;
  const panelH = ky + kr + h * 0.045;
  const labelY = panelH + h * 0.02;
  const labelH = Math.min(h * 0.12, 0.6 * IN);
  const zTop = labelY + labelH + h * 0.02;
  const zH = h * 0.95 - zTop;
  const rowsF = zH >= 3.2 * IN ? 2 : 1;
  const colsF = clamp(Math.floor(w / (1.9 * IN)), 2, 10);
  const cellW = (w * 0.92) / colsF;
  const cellH = zH / rowsF;
  const fsR = Math.min(cellW * 0.24, cellH * 0.28, 0.32 * IN);
  const ledR = Math.min(u * 0.028, 0.065 * IN);
  const switches: ReactNode[] = [];
  for (let ri = 0; ri < rowsF; ri++) {
    spread(colsF, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = zTop + cellH * (ri + 0.6);
      const n = ri * colsF + i;
      switches.push(
        <g key={n}>
          <Led cx={cx} cy={cy - fsR - ledR * 2.8} r={ledR} on={LED_COLORS[n % LED_COLORS.length]} />
          <Footswitch cx={cx} cy={cy} r={fsR} />
        </g>,
      );
    });
  }
  return {
    parts: (
      <>
        <ModelerPanel w={w} panelH={panelH} u={u} sx={sx} sy={sy} sw={sw} sh={sh} />
        {spread(nK, w * 0.08, w * 0.92).map((cx, i) => (
          <Knob key={i} cx={cx} cy={ky} r={kr} turn={i} light />
        ))}
        {switches}
      </>
    ),
    label: { x: w * 0.05, y: labelY, w: w * 0.9, h: labelH },
  };
}

function ModelerPanel({ w, panelH, u, sx, sy, sw, sh }: { w: number; panelH: number; u: number; sx: number; sy: number; sw: number; sh: number }) {
  const url = useUrl();
  const edge = Math.max(0.6, u * 0.008);
  const pad = sh * 0.14;
  const textX = sx + sh * 1.05;
  const textW = sw - sh * 1.05 - pad;
  return (
    <g>
      <rect x={0} y={0} width={w} height={panelH} fill={url("glass")} />
      <line x1={0} x2={w} y1={panelH} y2={panelH} stroke="#000" strokeOpacity={0.6} strokeWidth={edge * 1.5} />
      <line x1={0} x2={w} y1={panelH + edge * 1.5} y2={panelH + edge * 1.5} stroke="#fff" strokeOpacity={0.25} strokeWidth={edge} />
      <rect x={sx - edge * 2} y={sy - edge * 2} width={sw + edge * 4} height={sh + edge * 4} rx={u * 0.015} fill="#000" />
      <rect x={sx} y={sy} width={sw} height={sh} rx={u * 0.01} fill={url("lcd")} />
      <g filter={url("glow")} opacity={0.8}>
        <rect x={sx + pad} y={sy + pad} width={sh * 0.3} height={sh - pad * 2} rx={sh * 0.04} fill={HW.lcdGlow} />
        <rect x={sx + pad + sh * 0.4} y={sy + pad} width={sh * 0.3} height={sh - pad * 2} rx={sh * 0.04} fill={HW.lcdGlow} />
      </g>
      <rect x={sx + pad} y={sy + pad} width={sh * 0.3} height={sh - pad * 2} rx={sh * 0.04} fill="#bfe1ff" />
      <rect x={sx + pad + sh * 0.4} y={sy + pad} width={sh * 0.3} height={sh - pad * 2} rx={sh * 0.04} fill="#bfe1ff" />
      <rect x={textX} y={sy + sh * 0.3} width={textW} height={sh * 0.13} rx={sh * 0.03} fill={HW.lcdGlow} />
      <rect x={textX} y={sy + sh * 0.56} width={textW * 0.6} height={sh * 0.13} rx={sh * 0.03} fill={HW.lcdGlow} opacity={0.6} />
      {/* Glass glare across the top half of the screen. */}
      <path d={`M${sx} ${sy} H${sx + sw} V${sy + sh * 0.38} Q${sx + sw / 2} ${sy + sh * 0.5} ${sx} ${sy + sh * 0.38} Z`} fill="#fff" opacity={0.08} />
    </g>
  );
}

/** A footswitch box: a looper, a true bypass switcher or an amp's channel switch. Only switches and LEDs. */
const switcher: Draw = (w, h, u) => {
  const n = clamp(Math.round(w / (1.5 * IN)), 1, 12);
  const rows = h >= 4.5 * IN && n >= 3 ? 2 : 1;
  const top = h * 0.3;
  const zH = h * 0.95 - top;
  const cellW = (w * 0.92) / n;
  const cellH = zH / rows;
  const fsR = Math.min(cellW * 0.26, cellH * 0.27, 0.32 * IN);
  const ledR = Math.min(u * 0.032, 0.065 * IN);
  const parts: ReactNode[] = [];
  for (let ri = 0; ri < rows; ri++) {
    spread(n, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = top + cellH * (ri + 0.6);
      parts.push(
        <g key={`${ri}-${i}`}>
          <Led cx={cx} cy={cy - fsR - ledR * 2.8} r={ledR} on={(ri + i) % 2 ? "#2bd96b" : HW.led} />
          <Footswitch cx={cx} cy={cy} r={fsR} />
        </g>,
      );
    });
  }
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.15} u={u} />
        {parts}
      </>
    ),
    label: { x: w * 0.05, y: h * 0.05, w: w * 0.9, h: Math.min(h * 0.2, 0.55 * IN), align: "left" },
  };
};

/** The original custom pedal layout: two knobs, an LED, the name and one footswitch. */
const classic: Draw = (w, h, u, _color, dark) => {
  const r = u * 0.12;
  const ky = h * 0.1 + r;
  const fsR = u * 0.17;
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.3} u={u} />
        <Knob cx={w * 0.22} cy={ky} r={r} turn={0} light={dark} />
        <Knob cx={w * 0.78} cy={ky} r={r} turn={3} light={dark} />
        <Led cx={w / 2} cy={ky} r={u * 0.032} />
        <Footswitch cx={w / 2} cy={h * 0.93 - fsR} r={fsR} />
      </>
    ),
    label: { x: w * 0.06, y: ky + r + u * 0.06, w: w * 0.88, h: Math.max(0, h * 0.93 - fsR * 2 - u * 0.08 - (ky + r + u * 0.06)) },
  };
};

const DRAW: Record<PedalTemplate, Draw> = { classic, compact, hammond, wide, modeler, switcher };

const BODY_RADIUS: Record<PedalTemplate, number> = {
  classic: 0.07,
  compact: 0.05,
  hammond: 0.1,
  wide: 0.08,
  modeler: 0.04,
  switcher: 0.07,
};

function Label({ box, text, u, ink, flipX }: { box: LabelBox; text: string; u: number; ink: string; flipX?: boolean }) {
  if (!text || box.w <= 0 || box.h <= 0) return null;
  const size = Math.max(6, Math.min(box.h * 0.62, u * 0.13));
  const color = box.ink ?? ink;
  // Printed, slightly raised lettering: a hairline shadow on the side away from the light.
  const lift = color === "#ffffff" ? "0 1px 0 rgb(0 0 0 / 0.45)" : "0 1px 0 rgb(255 255 255 / 0.4)";
  return (
    <span
      className={`absolute flex items-center overflow-hidden font-bold leading-[1.05] tracking-[-0.01em] ${box.align === "left" ? "justify-start text-left" : "justify-center text-center"}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        fontSize: size,
        color,
        textShadow: lift,
        overflowWrap: "anywhere",
        transform: flipX ? "scaleX(-1)" : undefined,
      }}
    >
      {text}
    </span>
  );
}

/** Gradients and filters every part draws with, defined once per pedal. */
function Defs({ id, color, u, w, h, rx }: { id: string; color: string; u: number; w: number; h: number; rx: number }) {
  const v = (name: string, stops: [number, string, number?][]) => (
    <linearGradient id={`${id}-${name}`} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, c, a = 1]) => (
        <stop key={o} offset={o} stopColor={c} stopOpacity={a} />
      ))}
    </linearGradient>
  );
  const radial = (name: string, stops: [number, string][]) => (
    <radialGradient id={`${id}-${name}`} cx="38%" cy="30%" r="80%">
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </radialGradient>
  );
  return (
    <defs>
      {/* Body: lit from above, falling off toward the bottom edge. */}
      {v("body", [
        [0, shade(color, 0.16)],
        [0.45, color],
        [1, shade(color, -0.18)],
      ])}
      {/* Highlight edge: bright along the top, gone by the middle. */}
      {v("hl", [
        [0, "#fff", 0.55],
        [0.35, "#fff", 0.08],
        [1, "#fff", 0],
      ])}
      {v("rim", [
        [0, "#fff", 0.45],
        [0.5, "#fff", 0],
        [1, "#fff", 0],
      ])}
      {v("treadle", [
        [0, shade(color, 0.1)],
        [1, shade(color, -0.2)],
      ])}
      {v("rubber", [
        [0, "#2b2d31"],
        [1, "#111214"],
      ])}
      {v("skirt", [
        [0, "#4a4f57"],
        [1, "#141518"],
      ])}
      {radial("cap", [
        [0, "#5d636c"],
        [0.6, "#2a2d32"],
        [1, "#16181b"],
      ])}
      {v("skirtL", [
        [0, "#e9e4da"],
        [1, "#a39d92"],
      ])}
      {radial("capL", [
        [0, "#ffffff"],
        [0.7, "#ece7dd"],
        [1, "#cfc8bb"],
      ])}
      {v("chrome", [
        [0, "#f4f5f7"],
        [0.5, "#b9bec6"],
        [0.52, "#9ba1aa"],
        [1, "#d7dbe0"],
      ])}
      <linearGradient id={`${id}-chromeH`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#9ba1aa" />
        <stop offset="0.4" stopColor="#f4f5f7" />
        <stop offset="1" stopColor="#8a9099" />
      </linearGradient>
      {radial("button", [
        [0, "#ffffff"],
        [0.55, "#d3d7dd"],
        [1, "#8f959e"],
      ])}
      {v("glass", [
        [0, "#2c3038"],
        [1, "#15171b"],
      ])}
      {v("lcd", [
        [0, "#132238"],
        [1, HW.lcd],
      ])}
      <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={Math.max(0.6, u * 0.014)} />
      </filter>
      <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation={Math.max(0.8, u * 0.02)} />
      </filter>
      <clipPath id={`${id}-clip`}>
        <rect width={w} height={h} rx={rx} />
      </clipPath>
    </defs>
  );
}

/** Draws a custom pedal `w` × `h` canvas px in the given template. Missing template means Classic. */
export function PedalArt({
  template = "classic",
  w,
  h,
  color = DEFAULT_PEDAL_COLOR,
  label,
  flipX,
}: {
  template?: PedalTemplate;
  w: number;
  h: number;
  color?: string;
  label: string;
  flipX?: boolean;
}) {
  const id = `pp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const u = Math.min(w, h);
  const rx = u * BODY_RADIUS[template];
  const { parts, label: box } = DRAW[template](w, h, u, color, luminance(color) < 0.04);
  const edge = Math.max(0.75, u * 0.01);
  return (
    <div
      className="relative size-full"
      style={{ borderRadius: rx, boxShadow: "0 1px 1px rgb(0 0 0 / 0.25), 0 6px 14px -4px rgb(0 0 0 / 0.35)" }}
    >
      <Ids.Provider value={id}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 block size-full overflow-visible" aria-hidden>
          <Defs id={id} color={color} u={u} w={w} h={h} rx={rx} />
          <rect width={w} height={h} rx={rx} fill={`url(#${id}-body)`} />
          <g clipPath={`url(#${id}-clip)`}>{parts}</g>
          {/* Crisp outer edge, then a thin highlight just inside it along the top. */}
          <rect x={edge / 2} y={edge / 2} width={w - edge} height={h - edge} rx={rx} fill="none" stroke={shade(color, -0.6)} strokeWidth={edge} />
          <rect x={edge * 1.5} y={edge * 1.5} width={w - edge * 3} height={h - edge * 3} rx={Math.max(0, rx - edge)} fill="none" stroke={`url(#${id}-hl)`} strokeWidth={edge} />
        </svg>
      </Ids.Provider>
      {box && <Label box={box} text={label} u={u} ink={readableOn(color)} flipX={flipX} />}
    </div>
  );
}
