import type { ReactNode } from "react";
import { DEFAULT_PEDAL_COLOR, luminance, readableOn, shade } from "../lib/color";
import { PX_PER_INCH as IN } from "../lib/geometry";
import type { PedalTemplate } from "../lib/pedalTemplates";

/*
 * Custom pedal artwork, in a flat illustrated style: solid colors, no gradients or shadows. Every template lays
 * itself out in code at the pedal's real size (in canvas px), so knobs and footswitches keep their shape while
 * their spacing, and sometimes their count, follow the size.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `n` evenly spaced centers across [a, b]. */
const spread = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);

/** Hardware colors, shared by every template. */
const HW = {
  knob: "#363c39",
  panel: "#2f3532",
  treadle: "#3d4340",
  treadleLow: "#2f3532",
  jack: "#c5c8cb",
  switchOuter: "#b9bdc1",
  switchInner: "#f3f4f5",
  light: "#f3f4f5",
  led: "#ff4a1c",
  lcd: "#2563eb",
  lcdInk: "#93c5fd",
};

/** LED colors cycled across a row of switches. */
const LED_COLORS = ["#ff4a1c", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

type LabelBox = { x: number; y: number; w: number; h: number; align?: "left" | "center"; ink?: string };
type Layout = { parts: ReactNode; label: LabelBox | null };
/** `dark` is true on very dark bodies, where knobs switch to the white style so they still show. */
type Draw = (w: number, h: number, u: number, color: string, dark: boolean) => Layout;

/** Points of a regular `n`-gon, as an SVG points string. */
function polygon(cx: number, cy: number, r: number, n: number, rot = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n - Math.PI / 2;
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");
}

/** A knob: a dark heptagon with a white pointer, or with `light`, a white knob ringed in dark (for dark panels). */
function Knob({ cx, cy, r, turn = 0, light }: { cx: number; cy: number; r: number; turn?: number; light?: boolean }) {
  // Pointer angle varies by `turn` so a row of knobs doesn't look stamped.
  const a = ((-135 + ((turn * 67) % 270)) * Math.PI) / 180;
  const sw = Math.max(1, r * 0.14);
  const pointer = (from: number, to: number, stroke: string) => (
    <line
      x1={cx + Math.sin(a) * r * from}
      y1={cy - Math.cos(a) * r * from}
      x2={cx + Math.sin(a) * r * to}
      y2={cy - Math.cos(a) * r * to}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
    />
  );
  if (light) {
    return (
      <g>
        <polygon points={polygon(cx, cy, r, 7, a)} fill={HW.knob} />
        <circle cx={cx} cy={cy} r={r * 0.68} fill={HW.light} />
        {pointer(0.2, 0.62, HW.knob)}
      </g>
    );
  }
  return (
    <g>
      <polygon points={polygon(cx, cy, r, 7, a)} fill={HW.knob} />
      {pointer(0.35, 0.9, HW.light)}
    </g>
  );
}

/** A footswitch: a light octagonal nut around a white button. */
function Footswitch({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <polygon points={polygon(cx, cy, r, 8, Math.PI / 8)} fill={HW.switchOuter} />
      <circle cx={cx} cy={cy} r={r * 0.66} fill={HW.switchInner} />
    </g>
  );
}

function Led({ cx, cy, r, on = HW.led }: { cx: number; cy: number; r: number; on?: string }) {
  return <circle cx={cx} cy={cy} r={r} fill={on} />;
}

function Toggle({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={s * 0.5} fill={HW.jack} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s} stroke={HW.light} strokeWidth={s * 0.3} strokeLinecap="round" />
    </g>
  );
}

/** Input and output jacks on the sides. */
function SideJacks({ w, y, u }: { w: number; y: number; u: number }) {
  const jw = u * 0.06;
  const jh = u * 0.18;
  return (
    <g fill={HW.jack}>
      <rect x={0} y={y} width={jw} height={jh} />
      <rect x={w - jw} y={y} width={jw} height={jh} />
    </g>
  );
}

/** Boss-style compact: knobs on top, a stripe, the name, and a two-tone treadle. */
const compact: Draw = (w, h, u, color, dark) => {
  const n = clamp(Math.round(w / (0.72 * IN)), 1, 6);
  const knobZone = h * 0.3;
  const r = Math.min(((w * 0.88) / n) * 0.36, knobZone * 0.32);
  const stripeY = h * 0.36;
  const tx = w * 0.07;
  const ty = h * 0.58;
  const tw = w * 0.86;
  const th = h * 0.37;
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.16} u={u} />
        {spread(n, w * 0.06, w * 0.94).map((cx, i) => (
          <Knob key={i} cx={cx} cy={h * 0.04 + knobZone * 0.45} r={r} turn={i} light={dark} />
        ))}
        <Led cx={w * 0.88} cy={h * 0.03 + u * 0.03} r={u * 0.03} />
        <rect x={0} y={stripeY} width={w} height={h * 0.025} fill={shade(color, -0.18)} />
        <rect x={tx} y={ty} width={tw} height={th} rx={u * 0.03} fill={HW.treadleLow} />
        <rect x={tx} y={ty} width={tw} height={th * 0.42} rx={u * 0.03} fill={HW.treadle} />
        <rect x={tx} y={ty + th * 0.2} width={tw} height={th * 0.22} fill={HW.treadle} />
      </>
    ),
    label: { x: w * 0.07, y: stripeY + h * 0.035, w: w * 0.86, h: ty - stripeY - h * 0.05 },
  };
};

/** A small Hammond enclosure (1590B / 125B): a grid of knobs, the name, an LED and one footswitch. */
const hammond: Draw = (w, h, u, _color, dark) => {
  const top = h * 0.06;
  const zoneH = h * 0.44;
  const cols = clamp(Math.floor(w / (0.8 * IN)), 1, 4);
  const rows = clamp(Math.floor(zoneH / (0.85 * IN)), 1, 3);
  const cellW = (w * 0.9) / cols;
  const cellH = zoneH / rows;
  const r = Math.min(cellW, cellH, IN) * 0.34;
  const fsR = Math.min(u * 0.16, 0.32 * IN);
  const fsY = h * 0.94 - fsR;
  const ledY = fsY - fsR - u * 0.1;
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
        <Led cx={w / 2} cy={ledY} r={u * 0.035} />
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
          <Led key={i} cx={cx + fsR * 1.7} cy={fsY - fsR * 0.7} r={u * 0.03} on={LED_COLORS[i]} />
        ))}
        {fx.map((cx, i) => (
          <Footswitch key={i} cx={cx} cy={fsY} r={fsR} />
        ))}
      </>
    ),
    label: { x: w * 0.06, y: h * 0.04, w: w * 0.88, h: labelH },
  };
};

/** A digital modeler or multi-effect: a dark panel with a screen and knobs, the name, and a row of footswitches. */
const modeler: Draw = (w, h, u) => {
  const sw = Math.min(w * 0.36, h * 0.32 * 1.78);
  const sh = sw * 0.5;
  const sx = (w - sw) / 2;
  const sy = h * 0.06;
  const nK = clamp(Math.floor((w * 0.84) / (0.75 * IN)), 3, 8);
  const kr = Math.min(0.2 * IN, u * 0.065);
  const ky = sy + sh + kr + h * 0.04;
  const panelH = ky + kr + h * 0.04;
  const labelY = panelH + h * 0.02;
  const labelH = Math.min(h * 0.12, 0.6 * IN);
  const zTop = labelY + labelH + h * 0.02;
  const zH = h * 0.95 - zTop;
  const rowsF = zH >= 3.2 * IN ? 2 : 1;
  const colsF = clamp(Math.floor(w / (1.9 * IN)), 2, 10);
  const cellW = (w * 0.92) / colsF;
  const cellH = zH / rowsF;
  const fsR = Math.min(cellW * 0.24, cellH * 0.28, 0.32 * IN);
  const ledR = Math.min(u * 0.03, 0.07 * IN);
  const switches: ReactNode[] = [];
  for (let ri = 0; ri < rowsF; ri++) {
    spread(colsF, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = zTop + cellH * (ri + 0.6);
      const n = ri * colsF + i;
      switches.push(
        <g key={n}>
          <Led cx={cx} cy={cy - fsR - ledR * 2.4} r={ledR} on={LED_COLORS[n % LED_COLORS.length]} />
          <Footswitch cx={cx} cy={cy} r={fsR} />
        </g>,
      );
    });
  }
  // The screen: a big preset number and two lines of text, as blocks.
  const pad = sh * 0.14;
  return {
    parts: (
      <>
        <rect x={0} y={0} width={w} height={panelH} fill={HW.panel} />
        <rect x={sx} y={sy} width={sw} height={sh} rx={u * 0.01} fill={HW.lcd} />
        <rect x={sx + pad} y={sy + pad} width={sh * 0.32} height={sh - pad * 2} rx={sh * 0.04} fill={HW.lcdInk} />
        <rect x={sx + pad + sh * 0.42} y={sy + pad} width={sh * 0.32} height={sh - pad * 2} rx={sh * 0.04} fill={HW.lcdInk} />
        <rect x={sx + sh * 1.05} y={sy + sh * 0.3} width={sw - sh * 1.05 - pad} height={sh * 0.14} rx={sh * 0.03} fill={HW.lcdInk} />
        <rect x={sx + sh * 1.05} y={sy + sh * 0.56} width={(sw - sh * 1.05 - pad) * 0.6} height={sh * 0.14} rx={sh * 0.03} fill={HW.lcdInk} />
        {spread(nK, w * 0.08, w * 0.92).map((cx, i) => (
          <Knob key={i} cx={cx} cy={ky} r={kr} turn={i} light />
        ))}
        {switches}
      </>
    ),
    label: { x: w * 0.05, y: labelY, w: w * 0.9, h: labelH },
  };
};

/** A footswitch box: a looper, a true bypass switcher or an amp's channel switch. Only switches and LEDs. */
const switcher: Draw = (w, h, u) => {
  const n = clamp(Math.round(w / (1.5 * IN)), 1, 12);
  const rows = h >= 4.5 * IN && n >= 3 ? 2 : 1;
  const top = h * 0.3;
  const zH = h * 0.95 - top;
  const cellW = (w * 0.92) / n;
  const cellH = zH / rows;
  const fsR = Math.min(cellW * 0.26, cellH * 0.27, 0.32 * IN);
  const ledR = Math.min(u * 0.035, 0.07 * IN);
  const parts: ReactNode[] = [];
  for (let ri = 0; ri < rows; ri++) {
    spread(n, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = top + cellH * (ri + 0.6);
      parts.push(
        <g key={`${ri}-${i}`}>
          <Led cx={cx} cy={cy - fsR - ledR * 2.4} r={ledR} on={(ri + i) % 2 ? "#22c55e" : HW.led} />
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
        <Led cx={w / 2} cy={ky} r={u * 0.035} />
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
  return (
    <span
      className={`absolute flex items-center overflow-hidden font-bold leading-[1.05] tracking-[-0.01em] ${box.align === "left" ? "justify-start text-left" : "justify-center text-center"}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        fontSize: size,
        color: box.ink ?? ink,
        overflowWrap: "anywhere",
        transform: flipX ? "scaleX(-1)" : undefined,
      }}
    >
      {text}
    </span>
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
  const u = Math.min(w, h);
  const { parts, label: box } = DRAW[template](w, h, u, color, luminance(color) < 0.04);
  return (
    <div className="relative size-full overflow-hidden" style={{ borderRadius: u * BODY_RADIUS[template], background: color }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 block size-full" aria-hidden>
        {parts}
      </svg>
      {box && <Label box={box} text={label} u={u} ink={readableOn(color)} flipX={flipX} />}
    </div>
  );
}
