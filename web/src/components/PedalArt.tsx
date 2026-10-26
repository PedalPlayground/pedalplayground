import { createContext, useContext, useId, type ReactNode } from "react";
import { DEFAULT_PEDAL_COLOR, luminance, readableOn, shade } from "../lib/color";
import { PX_PER_INCH as IN } from "../lib/geometry";
import type { PedalTemplate } from "../lib/pedalTemplates";

/*
 * Custom pedal artwork, in a sleek industrial style (think Braun, Teenage Engineering, Apple): matte bodies under
 * soft light, brushed black cone knobs, black hex footswitches and small glowing LEDs, with crisp edges throughout.
 * Every template lays itself out in code at the pedal's real size (in canvas px), so knobs and footswitches keep
 * their shape while their spacing, and sometimes their count, follow the size.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `n` evenly spaced centers across [a, b]. */
const spread = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);

/** Light comes from the upper left. */
const LIGHT = (-135 * Math.PI) / 180;

const LED = { green: "#8dff6e", amber: "#ffb547", red: "#ff5a4a", blue: "#6fb6ff", violet: "#b99bff" };
const LED_ROW = [LED.green, LED.amber, LED.blue, LED.violet, LED.red];

/** Per-pedal prefix for gradient and filter ids, so many pedals on one page don't collide. */
const Ids = createContext("pp");
const useUrl = () => {
  const id = useContext(Ids);
  return (name: string) => `url(#${id}-${name})`;
};

type LabelBox = { x: number; y: number; w: number; h: number; align?: "left" | "center" };
type Layout = { parts: ReactNode; label: LabelBox | null };
/** `dark` is true on dark bodies, where knobs switch to the white style. */
type Draw = (w: number, h: number, u: number, color: string, dark: boolean) => Layout;

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const gray = (v: number) => `rgb(${v} ${v} ${v + 3})`;

/** A soft shadow cast down and to the right, the way the light falls. */
function Cast({ cx, cy, r, k = 1 }: { cx: number; cy: number; r: number; k?: number }) {
  const url = useUrl();
  return <circle cx={cx + r * 0.14 * k} cy={cy + r * 0.22 * k} r={r * 1.02} fill="#000" opacity={0.42} filter={url("soft")} />;
}

/**
 * A brushed cone: wedges around the center, shaded so two soft highlights face the light, like the machined top of
 * a knob. Drawn with paths because SVG has no conic gradient.
 */
function Cone({ cx, cy, r, lo, hi, n = 36 }: { cx: number; cy: number; r: number; lo: number; hi: number; n?: number }) {
  const step = (Math.PI * 2) / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a0 = i * step - Math.PI / 2;
        const a1 = a0 + step * 1.04; // a hair of overlap hides seams
        const mid = a0 + step / 2;
        const t = 0.5 + 0.5 * Math.cos(2 * (mid - LIGHT));
        const lift = 0.5 + 0.5 * Math.cos(mid - LIGHT); // the lit side reads a little brighter
        const v = mix(lo, hi, t * (0.55 + 0.45 * lift));
        return (
          <path
            key={i}
            d={`M${cx} ${cy} L${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r} Z`}
            fill={gray(v)}
          />
        );
      })}
    </g>
  );
}

/** A knob: matte black with a brushed cone top and a white index line, or with `light`, white with a dark one. */
function Knob({ cx, cy, r, turn = 0, light }: { cx: number; cy: number; r: number; turn?: number; light?: boolean }) {
  const url = useUrl();
  const a = ((-135 + ((turn * 67) % 270)) * Math.PI) / 180;
  const at = (k: number) => ({ x: cx + Math.sin(a) * r * k, y: cy - Math.cos(a) * r * k });
  const i1 = at(0.6);
  const i2 = at(0.94);
  const hair = Math.max(0.5, r * 0.035);
  if (light) {
    return (
      <g>
        <Cast cx={cx} cy={cy} r={r} />
        <circle cx={cx} cy={cy} r={r} fill={url("whiteSkirt")} />
        <circle cx={cx} cy={cy} r={r * 0.84} fill={url("whiteCap")} />
        <circle cx={cx} cy={cy} r={r - hair / 2} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={hair} />
        <circle cx={cx} cy={cy} r={r * 0.84} fill="none" stroke="#fff" strokeWidth={hair * 1.2} strokeOpacity={0.9} />
        <line x1={i1.x} y1={i1.y} x2={i2.x} y2={i2.y} stroke="#1d1f23" strokeWidth={Math.max(1, r * 0.09)} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <Cast cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r} fill={url("blackSkirt")} />
      <Cone cx={cx} cy={cy} r={r * 0.8} lo={18} hi={96} />
      <circle cx={cx} cy={cy} r={r * 0.8} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={hair} />
      <circle cx={cx} cy={cy} r={r - hair / 2} fill="none" stroke={url("rimLight")} strokeWidth={hair} />
      <line x1={i1.x} y1={i1.y} x2={i2.x} y2={i2.y} stroke="#f4f4f2" strokeWidth={Math.max(1, r * 0.09)} strokeLinecap="round" />
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

/** A footswitch: a black hex nut, a thin chrome ring and a satin black button. */
function Footswitch({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const url = useUrl();
  const hair = Math.max(0.5, r * 0.03);
  return (
    <g>
      <Cast cx={cx} cy={cy} r={r} k={1.1} />
      <polygon points={polygon(cx, cy, r, 6, Math.PI / 6)} fill={url("nut")} stroke="#000" strokeWidth={hair} strokeLinejoin="round" />
      <polygon points={polygon(cx, cy, r - hair * 1.5, 6, Math.PI / 6)} fill="none" stroke={url("rimLight")} strokeWidth={hair} strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r * 0.7} fill={url("chromeRing")} />
      <circle cx={cx} cy={cy} r={r * 0.58} fill={url("button")} stroke="#000" strokeWidth={hair} />
      <ellipse cx={cx - r * 0.15} cy={cy - r * 0.2} rx={r * 0.26} ry={r * 0.14} fill="#fff" opacity={0.18} />
    </g>
  );
}

/** A small LED in a black bezel, glowing softly. */
function Led({ cx, cy, r, on = LED.green }: { cx: number; cy: number; r: number; on?: string }) {
  const url = useUrl();
  return (
    <g>
      <circle cx={cx + r * 0.2} cy={cy + r * 0.35} r={r * 1.9} fill="#000" opacity={0.35} filter={url("soft")} />
      <circle cx={cx} cy={cy} r={r * 1.9} fill={url("bezel")} />
      <circle cx={cx} cy={cy} r={r * 1.9 - 0.5} fill="none" stroke={url("rimLight")} strokeWidth={Math.max(0.5, r * 0.12)} />
      <circle cx={cx} cy={cy} r={r * 1.5} fill={on} opacity={0.5} filter={url("glow")} />
      <circle cx={cx} cy={cy} r={r} fill={on} />
      <circle cx={cx - r * 0.25} cy={cy - r * 0.3} r={r * 0.38} fill="#fff" opacity={0.75} />
    </g>
  );
}

/** A mini toggle: a black hex nut with a chrome bat. */
function Toggle({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  const url = useUrl();
  const hair = Math.max(0.5, s * 0.05);
  return (
    <g>
      <Cast cx={cx} cy={cy} r={s * 0.6} />
      <polygon points={polygon(cx, cy, s * 0.62, 6, Math.PI / 6)} fill={url("nut")} stroke="#000" strokeWidth={hair} />
      <circle cx={cx} cy={cy} r={s * 0.3} fill={url("chromeRing")} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s * 0.85} stroke="#000" strokeOpacity={0.6} strokeWidth={s * 0.22 + hair * 2} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s * 0.85} stroke={url("chromeBar")} strokeWidth={s * 0.22} strokeLinecap="round" />
    </g>
  );
}

/** Black jacks set into both sides. */
function SideJacks({ w, y, u }: { w: number; y: number; u: number }) {
  const url = useUrl();
  const jw = u * 0.055;
  const jh = u * 0.2;
  return (
    <g fill={url("jack")}>
      <rect x={-jw} y={y} width={jw * 2} height={jh} rx={jw * 0.5} />
      <rect x={w - jw} y={y} width={jw * 2} height={jh} rx={jw * 0.5} />
    </g>
  );
}

/** A panel seam: a crisp shadow line with a highlight under it. */
function Seam({ x1, x2, y, u }: { x1: number; x2: number; y: number; u: number }) {
  const sw = Math.max(0.5, u * 0.008);
  return (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke="#000" strokeOpacity={0.28} strokeWidth={sw} />
      <line x1={x1} x2={x2} y1={y + sw} y2={y + sw} stroke="#fff" strokeOpacity={0.3} strokeWidth={sw} />
    </g>
  );
}

/** Boss-style compact: knobs on top, a seam, the name, and a matte treadle with a fine-ribbed rubber pad. */
const compact: Draw = (w, h, u, color, dark) => {
  const n = clamp(Math.round(w / (0.72 * IN)), 1, 6);
  const knobZone = h * 0.3;
  const r = Math.min(((w * 0.88) / n) * 0.36, knobZone * 0.33);
  const seamY = h * 0.36;
  const tx = w * 0.06;
  const ty = h * 0.56;
  const tw = w * 0.88;
  const th = h * 0.4;
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.16} u={u} />
        {spread(n, w * 0.06, w * 0.94).map((cx, i) => (
          <Knob key={i} cx={cx} cy={h * 0.04 + knobZone * 0.45} r={r} turn={i} light={dark} />
        ))}
        <Led cx={w / 2} cy={seamY - u * 0.07} r={u * 0.022} on={LED.red} />
        <Seam x1={0} x2={w} y={seamY} u={u} />
        <Treadle x={tx} y={ty} w={tw} h={th} u={u} color={color} />
      </>
    ),
    label: { x: w * 0.07, y: seamY + h * 0.02, w: w * 0.86, h: ty - seamY - h * 0.035 },
  };
};

function Treadle({ x, y, w, h, u, color }: { x: number; y: number; w: number; h: number; u: number; color: string }) {
  const url = useUrl();
  const rx = u * 0.035;
  const hair = Math.max(0.5, u * 0.008);
  const px = x + w * 0.08;
  const pw = w * 0.84;
  const padY = y + h * 0.5;
  const padH = h * 0.4;
  const ribs = Math.max(4, Math.floor(padH / (0.08 * IN)));
  return (
    <g>
      <rect x={x + u * 0.02} y={y + u * 0.04} width={w} height={h} rx={rx} fill="#000" opacity={0.35} filter={url("soft")} />
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={shade(color, -0.06)} stroke={shade(color, -0.35)} strokeWidth={hair} />
      <rect x={x + hair} y={y + hair} width={w - hair * 2} height={h - hair * 2} rx={rx} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={hair} />
      <rect x={px} y={padY} width={pw} height={padH} rx={u * 0.02} fill="#18191c" />
      {spread(ribs, padY, padY + padH).map((ry, i) => (
        <line key={i} x1={px + pw * 0.04} x2={px + pw * 0.96} y1={ry} y2={ry} stroke="#2e3035" strokeWidth={Math.max(0.5, u * 0.008)} />
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
  const r = Math.min(cellW, cellH, IN) * 0.36;
  const fsR = Math.min(u * 0.17, 0.34 * IN);
  const fsY = h * 0.93 - fsR;
  const ledY = fsY - fsR - u * 0.12;
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
        <Led cx={w / 2} cy={ledY} r={u * 0.028} />
        <Footswitch cx={w / 2} cy={fsY} r={fsR} />
      </>
    ),
    label: { x: w * 0.06, y: top + zoneH + u * 0.02, w: w * 0.88, h: Math.max(0, ledY - u * 0.09 - (top + zoneH + u * 0.02)) },
  };
};

/** A wide Hammond enclosure (1590BB), Chase Bliss / Walrus style: knobs in rows, toggles, LEDs and footswitches. */
const wide: Draw = (w, h, u, _color, dark) => {
  const labelH = h * 0.14;
  const top = h * 0.04 + labelH + h * 0.02;
  const zoneH = h * 0.38;
  const cols = clamp(Math.floor(w / (1.4 * IN)), 2, 8);
  const rows = clamp(Math.floor(zoneH / (0.62 * IN)), 1, 2);
  const cellW = (w * 0.9) / cols;
  const cellH = zoneH / rows;
  const r = Math.min(cellW, cellH, IN) * 0.33;
  const s = Math.min(u * 0.1, 0.18 * IN);
  const toggleY = top + zoneH + h * 0.07;
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
          <Led key={i} cx={cx} cy={fsY - fsR - u * 0.08} r={u * 0.024} />
        ))}
        {fx.map((cx, i) => (
          <Footswitch key={i} cx={cx} cy={fsY} r={fsR} />
        ))}
      </>
    ),
    label: { x: w * 0.06, y: h * 0.04, w: w * 0.88, h: labelH },
  };
};

/** A digital modeler or multi-effect: an inset display with waveforms, a row of knobs, then footswitches. */
const modeler: Draw = (w, h, u, _color, dark) => {
  const dx = w * 0.06;
  const dy = h * 0.07;
  const dw = w * 0.88;
  const dh = Math.min(h * 0.2, 1.4 * IN);
  const nK = clamp(Math.floor((w * 0.84) / (0.85 * IN)), 3, 8);
  const kr = Math.min(0.24 * IN, u * 0.075);
  const ky = dy + dh + kr + h * 0.06;
  const labelY = ky + kr + h * 0.03;
  const labelH = Math.min(h * 0.12, 0.6 * IN);
  const zTop = labelY + labelH + h * 0.02;
  const zH = h * 0.95 - zTop;
  const rowsF = zH >= 3.2 * IN ? 2 : 1;
  const colsF = clamp(Math.floor(w / (1.9 * IN)), 2, 10);
  const cellW = (w * 0.92) / colsF;
  const cellH = zH / rowsF;
  const fsR = Math.min(cellW * 0.24, cellH * 0.28, 0.32 * IN);
  const ledR = Math.min(u * 0.022, 0.05 * IN);
  const switches: ReactNode[] = [];
  for (let ri = 0; ri < rowsF; ri++) {
    spread(colsF, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = zTop + cellH * (ri + 0.6);
      const n = ri * colsF + i;
      switches.push(
        <g key={n}>
          <Led cx={cx} cy={cy - fsR - ledR * 3.2} r={ledR} on={LED_ROW[n % LED_ROW.length]} />
          <Footswitch cx={cx} cy={cy} r={fsR} />
        </g>,
      );
    });
  }
  return {
    parts: (
      <>
        <Display x={dx} y={dy} w={dw} h={dh} u={u} />
        {spread(nK, w * 0.08, w * 0.92).map((cx, i) => (
          <Knob key={i} cx={cx} cy={ky} r={kr} turn={i} light={dark} />
        ))}
        {switches}
      </>
    ),
    label: { x: w * 0.06, y: labelY, w: w * 0.88, h: labelH, align: "left" },
  };
};

/** An inset black display with two waveform lanes and a playhead. */
function Display({ x, y, w, h, u }: { x: number; y: number; w: number; h: number; u: number }) {
  const url = useUrl();
  const rx = u * 0.025;
  const pad = h * 0.16;
  const lanes = [
    { y: y + h * 0.36, c: "#9b8cff", seed: 1 },
    { y: y + h * 0.72, c: "#5fa8ff", seed: 2 },
  ];
  const bars = Math.max(12, Math.floor((w - pad * 2) / Math.max(2, u * 0.03)));
  const bw = (w - pad * 2) / bars;
  return (
    <g>
      <rect x={x} y={y + u * 0.006} width={w} height={h} rx={rx} fill="#fff" opacity={0.45} />
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={url("screen")} stroke="#000" strokeWidth={Math.max(0.5, u * 0.008)} />
      {lanes.map((l) =>
        Array.from({ length: bars }, (_, i) => {
          const amp = (0.25 + 0.75 * Math.abs(Math.sin(i * 0.55 * l.seed + l.seed) * Math.cos(i * 0.17))) * h * 0.13;
          return <rect key={`${l.seed}-${i}`} x={x + pad + i * bw + bw * 0.32} y={l.y - amp} width={bw * 0.36} height={amp * 2} rx={bw * 0.18} fill={l.c} opacity={0.85} />;
        }),
      )}
      <line x1={x + w / 2} x2={x + w / 2} y1={y + pad * 0.6} y2={y + h - pad * 0.6} stroke="#fff" strokeOpacity={0.8} strokeWidth={Math.max(0.5, u * 0.006)} />
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
  const ledR = Math.min(u * 0.026, 0.055 * IN);
  const parts: ReactNode[] = [];
  for (let ri = 0; ri < rows; ri++) {
    spread(n, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = top + cellH * (ri + 0.6);
      parts.push(
        <g key={`${ri}-${i}`}>
          <Led cx={cx} cy={cy - fsR - ledR * 3.2} r={ledR} on={(ri + i) % 3 === 1 ? LED.amber : LED.green} />
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
  const r = u * 0.13;
  const ky = h * 0.1 + r;
  const fsR = u * 0.17;
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.3} u={u} />
        <Knob cx={w * 0.24} cy={ky} r={r} turn={0} light={dark} />
        <Knob cx={w * 0.76} cy={ky} r={r} turn={3} light={dark} />
        <Led cx={w / 2} cy={ky} r={u * 0.026} />
        <Footswitch cx={w / 2} cy={h * 0.93 - fsR} r={fsR} />
      </>
    ),
    label: { x: w * 0.06, y: ky + r + u * 0.06, w: w * 0.88, h: Math.max(0, h * 0.93 - fsR * 2 - u * 0.08 - (ky + r + u * 0.06)) },
  };
};

const DRAW: Record<PedalTemplate, Draw> = { classic, compact, hammond, wide, modeler, switcher };

const BODY_RADIUS: Record<PedalTemplate, number> = {
  classic: 0.08,
  compact: 0.06,
  hammond: 0.1,
  wide: 0.09,
  modeler: 0.06,
  switcher: 0.08,
};

function Label({ box, text, u, ink, flipX }: { box: LabelBox; text: string; u: number; ink: string; flipX?: boolean }) {
  if (!text || box.w <= 0 || box.h <= 0) return null;
  const size = Math.max(6, Math.min(box.h * 0.62, u * 0.14));
  return (
    <span
      className={`absolute flex items-center overflow-hidden font-medium leading-[1.02] tracking-[-0.03em] ${box.align === "left" ? "justify-start text-left" : "justify-center text-center"}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        fontSize: size,
        color: ink,
        opacity: 0.88,
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
  const lin = (name: string, stops: [number, string, number?][], dir: [number, number, number, number] = [0, 0, 0, 1]) => (
    <linearGradient id={`${id}-${name}`} x1={dir[0]} y1={dir[1]} x2={dir[2]} y2={dir[3]}>
      {stops.map(([o, c, a = 1]) => (
        <stop key={o} offset={o} stopColor={c} stopOpacity={a} />
      ))}
    </linearGradient>
  );
  const rad = (name: string, stops: [number, string][], cx = "35%", cy = "30%") => (
    <radialGradient id={`${id}-${name}`} cx={cx} cy={cy} r="85%">
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </radialGradient>
  );
  return (
    <defs>
      {/* Matte body under a soft key light from the upper left. */}
      {lin(
        "body",
        [
          [0, shade(color, 0.1)],
          [0.55, color],
          [1, shade(color, -0.1)],
        ],
        [0, 0, 0.6, 1],
      )}
      {/* Edge light: bright on the top and left edges, fading out. */}
      {lin(
        "edge",
        [
          [0, "#fff", 0.7],
          [0.3, "#fff", 0.15],
          [0.6, "#fff", 0],
        ],
        [0, 0, 0.7, 1],
      )}
      {lin(
        "rimLight",
        [
          [0, "#fff", 0.35],
          [0.5, "#fff", 0],
        ],
        [0, 0, 0.6, 1],
      )}
      {lin("blackSkirt", [
        [0, "#33353a"],
        [1, "#0c0d0f"],
      ])}
      {lin("whiteSkirt", [
        [0, "#ffffff"],
        [1, "#b9bdc5"],
      ])}
      {rad("whiteCap", [
        [0, "#ffffff"],
        [0.7, "#eef0f3"],
        [1, "#d9dce2"],
      ])}
      {lin(
        "nut",
        [
          [0, "#4a4d53"],
          [0.5, "#202226"],
          [1, "#0e0f11"],
        ],
        [0, 0, 0.6, 1],
      )}
      {lin(
        "chromeRing",
        [
          [0, "#f5f6f8"],
          [0.5, "#8d929a"],
          [1, "#d5d8dd"],
        ],
        [0, 0, 0.6, 1],
      )}
      {lin(
        "chromeBar",
        [
          [0, "#8d929a"],
          [0.45, "#f5f6f8"],
          [1, "#7c818a"],
        ],
        [0, 0, 1, 0],
      )}
      {rad("button", [
        [0, "#45484e"],
        [0.6, "#1b1c1f"],
        [1, "#0b0b0d"],
      ])}
      {rad("bezel", [
        [0, "#2a2c30"],
        [1, "#0a0a0c"],
      ])}
      {lin("jack", [
        [0, "#3a3d42"],
        [1, "#0e0f11"],
      ])}
      {lin("screen", [
        [0, "#16171c"],
        [1, "#0a0b0e"],
      ])}
      <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation={Math.max(0.8, u * 0.022)} />
      </filter>
      <filter id={`${id}-glow`} x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation={Math.max(0.6, u * 0.018)} />
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
  const { parts, label: box } = DRAW[template](w, h, u, color, luminance(color) < 0.06);
  const hair = Math.max(0.6, u * 0.008);
  return (
    <div
      className="relative size-full"
      style={{
        borderRadius: rx,
        // Contact shadow plus a long, soft one falling down and to the right.
        boxShadow: `0 1px 1.5px rgb(0 0 0 / 0.22), ${u * 0.04}px ${u * 0.08}px ${u * 0.14}px -${u * 0.02}px rgb(0 0 0 / 0.28)`,
      }}
    >
      <Ids.Provider value={id}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 block size-full" aria-hidden>
          <Defs id={id} color={color} u={u} w={w} h={h} rx={rx} />
          <g clipPath={`url(#${id}-clip)`}>
            <rect width={w} height={h} fill={`url(#${id}-body)`} />
            {parts}
          </g>
          <rect x={hair / 2} y={hair / 2} width={w - hair} height={h - hair} rx={rx} fill="none" stroke={shade(color, -0.24)} strokeWidth={hair} />
          <rect x={hair * 1.5} y={hair * 1.5} width={w - hair * 3} height={h - hair * 3} rx={Math.max(0, rx - hair)} fill="none" stroke={`url(#${id}-edge)`} strokeWidth={hair} />
        </svg>
      </Ids.Provider>
      {box && <Label box={box} text={label} u={u} ink={readableOn(color)} flipX={flipX} />}
    </div>
  );
}
