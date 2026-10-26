import { useId, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_PEDAL_COLOR, readableOn, shade } from "../lib/color";
import { PX_PER_INCH as IN } from "../lib/geometry";
import type { PedalTemplate } from "../lib/pedalTemplates";

/*
 * Custom pedal artwork. Every template lays itself out in code at the pedal's real size (in canvas px), so knobs and
 * footswitches stay round and sensibly sized while their spacing, and sometimes their count, follow the size.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `n` evenly spaced centers across [a, b]. */
const spread = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);

type LabelBox = { x: number; y: number; w: number; h: number; align?: "left" | "center"; ink?: string; bold?: boolean };
type Paint = { knob: string; metal: string };
type Layout = { parts: ReactNode; label: LabelBox | null };
type Draw = (w: number, h: number, u: number, p: Paint, color: string) => Layout;

/** Footswitch LED colors on modelers, cycled per switch. */
const SCENE_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

function Knob({ cx, cy, r, p, turn = 0 }: { cx: number; cy: number; r: number; p: Paint; turn?: number }) {
  // Pointer angle varies by `turn` so a row of knobs doesn't look stamped.
  const a = ((-135 + ((turn * 67) % 270)) * Math.PI) / 180;
  const inner = r * 0.78;
  return (
    <g>
      <circle cx={cx} cy={cy + r * 0.1} r={r} fill="rgb(0 0 0 / 0.28)" />
      <circle cx={cx} cy={cy} r={r} fill="#141416" />
      <circle cx={cx} cy={cy} r={inner} fill={p.knob} />
      <line
        x1={cx + Math.sin(a) * inner * 0.25}
        y1={cy - Math.cos(a) * inner * 0.25}
        x2={cx + Math.sin(a) * inner * 0.9}
        y2={cy - Math.cos(a) * inner * 0.9}
        stroke="#ececef"
        strokeWidth={Math.max(0.8, r * 0.13)}
        strokeLinecap="round"
      />
    </g>
  );
}

function Footswitch({ cx, cy, r, p }: { cx: number; cy: number; r: number; p: Paint }) {
  return (
    <g>
      <circle cx={cx} cy={cy + r * 0.1} r={r} fill="rgb(0 0 0 / 0.3)" />
      <circle cx={cx} cy={cy} r={r} fill={p.metal} />
      <circle cx={cx} cy={cy} r={r * 0.74} fill="none" stroke="rgb(0 0 0 / 0.22)" strokeWidth={Math.max(0.5, r * 0.06)} />
      <circle cx={cx} cy={cy} r={r * 0.52} fill={p.metal} stroke="rgb(0 0 0 / 0.18)" strokeWidth={Math.max(0.5, r * 0.04)} />
    </g>
  );
}

function Led({ cx, cy, r, on = "#ff4d4d" }: { cx: number; cy: number; r: number; on?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 2.2} fill={on} opacity={0.22} />
      <circle cx={cx} cy={cy} r={r * 1.35} fill="#1b1b1d" />
      <circle cx={cx} cy={cy} r={r} fill={on} />
    </g>
  );
}

function Toggle({ cx, cy, s, p }: { cx: number; cy: number; s: number; p: Paint }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={s * 0.55} fill={p.metal} stroke="rgb(0 0 0 / 0.3)" strokeWidth={Math.max(0.5, s * 0.06)} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s} stroke="#d4d4d8" strokeWidth={s * 0.32} strokeLinecap="round" />
    </g>
  );
}

/** Input and output jacks peeking in from the sides. */
function SideJacks({ w, y, u }: { w: number; y: number; u: number }) {
  const jw = u * 0.05;
  const jh = u * 0.16;
  return (
    <g fill="#222">
      <rect x={0} y={y} width={jw} height={jh} rx={jw * 0.3} />
      <rect x={w - jw} y={y} width={jw} height={jh} rx={jw * 0.3} />
    </g>
  );
}

/** Boss-style compact: a knob panel on top and a big treadle with a rubber pad. */
const compact: Draw = (w, h, u, p, color) => {
  const panelH = h * 0.36;
  const n = clamp(Math.round(w / (0.72 * IN)), 1, 6);
  const r = Math.min(((w * 0.88) / n) * 0.34, panelH * 0.3);
  const tx = w * 0.06;
  const ty = h * 0.39;
  const tw = w * 0.88;
  const th = h * 0.56;
  const treadle = shade(color, -0.14);
  const padY = ty + th * 0.62;
  const padH = th * 0.3;
  const grooves = Math.max(2, Math.floor(padH / (0.13 * IN)));
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.18} u={u} />
        {spread(n, w * 0.06, w * 0.94).map((cx, i) => (
          <Knob key={i} cx={cx} cy={panelH * 0.48} r={r} p={p} turn={i} />
        ))}
        <Led cx={w / 2} cy={panelH * 0.93} r={u * 0.028} />
        <rect x={tx} y={ty + u * 0.02} width={tw} height={th} rx={u * 0.05} fill="rgb(0 0 0 / 0.3)" />
        <rect x={tx} y={ty} width={tw} height={th} rx={u * 0.05} fill={treadle} stroke="rgb(0 0 0 / 0.25)" strokeWidth={0.75} />
        <rect x={tx + u * 0.02} y={ty + u * 0.015} width={tw - u * 0.04} height={u * 0.02} rx={u * 0.01} fill="rgb(255 255 255 / 0.18)" />
        <rect x={tx + tw * 0.06} y={padY} width={tw * 0.88} height={padH} rx={u * 0.025} fill="#1c1c1e" />
        {spread(grooves, padY, padY + padH).map((y, i) => (
          <line key={i} x1={tx + tw * 0.1} x2={tx + tw * 0.9} y1={y} y2={y} stroke="#3a3a3e" strokeWidth={Math.max(0.6, u * 0.012)} />
        ))}
      </>
    ),
    label: { x: tx + tw * 0.06, y: ty + th * 0.06, w: tw * 0.88, h: th * 0.5, ink: readableOn(treadle), bold: true },
  };
};

/** A small Hammond enclosure (1590B / 125B): a grid of knobs, the name, an LED and one footswitch. */
const hammond: Draw = (w, h, u, p) => {
  const top = h * 0.06;
  const zoneH = h * 0.44;
  const cols = clamp(Math.floor(w / (0.8 * IN)), 1, 4);
  const rows = clamp(Math.floor(zoneH / (0.85 * IN)), 1, 3);
  const cellW = (w * 0.9) / cols;
  const cellH = zoneH / rows;
  const r = Math.min(cellW, cellH, IN) * 0.32;
  const fsR = Math.min(u * 0.15, 0.3 * IN);
  const fsY = h * 0.94 - fsR;
  const ledY = fsY - fsR - u * 0.12;
  const knobs: ReactNode[] = [];
  for (let ri = 0; ri < rows; ri++) {
    // A last row one knob short, centered under the others, reads like a real layout.
    const n = rows > 1 && ri === rows - 1 && cols >= 3 ? cols - 1 : cols;
    const inset = ((cols - n) * cellW) / 2;
    spread(n, w * 0.05 + inset, w * 0.95 - inset).forEach((cx, i) =>
      knobs.push(<Knob key={`${ri}-${i}`} cx={cx} cy={top + cellH * (ri + 0.5)} r={r} p={p} turn={ri * 3 + i} />),
    );
  }
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.22} u={u} />
        {knobs}
        <Led cx={w / 2} cy={ledY} r={u * 0.035} />
        <Footswitch cx={w / 2} cy={fsY} r={fsR} p={p} />
      </>
    ),
    label: { x: w * 0.06, y: top + zoneH + u * 0.02, w: w * 0.88, h: Math.max(0, ledY - u * 0.08 - (top + zoneH + u * 0.02)) },
  };
};

/** A wide Hammond enclosure (1590BB), Chase Bliss / Walrus style: knobs in rows, toggles, and two footswitches. */
const wide: Draw = (w, h, u, p) => {
  const labelH = h * 0.14;
  const top = h * 0.04 + labelH + h * 0.02;
  const zoneH = h * 0.38;
  const cols = clamp(Math.floor(w / (1.4 * IN)), 2, 8);
  const rows = clamp(Math.floor(zoneH / (0.62 * IN)), 1, 2);
  const cellW = (w * 0.9) / cols;
  const cellH = zoneH / rows;
  const r = Math.min(cellW, cellH, IN) * 0.3;
  const s = Math.min(u * 0.1, 0.18 * IN);
  const toggleY = top + zoneH + h * 0.08;
  const nF = w >= 7.5 * IN ? 3 : w >= 3.4 * IN ? 2 : 1;
  const fsR = Math.min(u * 0.14, (w / nF) * 0.2, 0.3 * IN);
  const fsY = h * 0.95 - fsR;
  const ledY = fsY - fsR - u * 0.09;
  const fx = spread(nF, w * 0.05, w * 0.95);
  return {
    parts: (
      <>
        <SideJacks w={w} y={h * 0.3} u={u} />
        {Array.from({ length: rows }, (_, ri) =>
          spread(cols, w * 0.05, w * 0.95).map((cx, i) => (
            <Knob key={`${ri}-${i}`} cx={cx} cy={top + cellH * (ri + 0.5)} r={r} p={p} turn={ri * cols + i} />
          )),
        )}
        {spread(cols, w * 0.12, w * 0.88).map((cx, i) => (
          <Toggle key={i} cx={cx} cy={toggleY} s={s} p={p} />
        ))}
        {fx.map((cx, i) => (
          <Led key={i} cx={cx} cy={ledY} r={u * 0.03} on={i === 0 ? "#ff4d4d" : "#3b82f6"} />
        ))}
        {fx.map((cx, i) => (
          <Footswitch key={i} cx={cx} cy={fsY} r={fsR} p={p} />
        ))}
      </>
    ),
    label: { x: w * 0.06, y: h * 0.04, w: w * 0.88, h: labelH },
  };
};

/** A digital modeler or multi-effect: a screen, a row of small knobs, and footswitches with colored rings. */
const modeler: Draw = (w, h, u, p) => {
  const sw = Math.min(w * 0.36, h * 0.36 * 1.78);
  const sh = sw * 0.56;
  const sx = (w - sw) / 2;
  const sy = h * 0.07;
  const nK = clamp(Math.floor((w * 0.84) / (0.75 * IN)), 3, 8);
  const kr = Math.min(0.2 * IN, u * 0.065);
  const ky = sy + sh + kr + h * 0.05;
  const zTop = ky + kr + h * 0.05;
  const zH = h * 0.95 - zTop;
  const rowsF = zH >= 3.2 * IN ? 2 : 1;
  const colsF = clamp(Math.floor(w / (1.9 * IN)), 2, 10);
  const cellW = (w * 0.92) / colsF;
  const cellH = zH / rowsF;
  const fsR = Math.min(cellW * 0.22, cellH * 0.26, 0.3 * IN);
  const stripW = Math.min(cellW * 0.62, fsR * 3.2);
  const stripH = fsR * 0.55;
  const blocks = clamp(Math.floor(sw / (0.45 * IN)), 3, 6);
  const bw = (sw * 0.8) / blocks;
  const switches: ReactNode[] = [];
  for (let ri = 0; ri < rowsF; ri++) {
    spread(colsF, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = zTop + cellH * (ri + 0.5) + stripH * 0.6;
      const n = ri * colsF + i;
      switches.push(
        <g key={n}>
          <rect x={cx - stripW / 2} y={cy - fsR * 1.45 - stripH * 1.3} width={stripW} height={stripH} rx={stripH * 0.2} fill="#0b0e13" />
          <rect x={cx - stripW * 0.3} y={cy - fsR * 1.45 - stripH * 0.95} width={stripW * 0.6} height={stripH * 0.3} rx={stripH * 0.1} fill="rgb(255 255 255 / 0.55)" />
          <circle cx={cx} cy={cy} r={fsR * 1.28} fill="none" stroke={SCENE_COLORS[n % SCENE_COLORS.length]} strokeWidth={fsR * 0.16} />
          <Footswitch cx={cx} cy={cy} r={fsR} p={p} />
        </g>,
      );
    });
  }
  return {
    parts: (
      <>
        <rect x={sx - u * 0.015} y={sy - u * 0.015} width={sw + u * 0.03} height={sh + u * 0.03} rx={u * 0.025} fill="#1a1a1c" />
        <rect x={sx} y={sy} width={sw} height={sh} rx={u * 0.015} fill="#0b0f14" />
        <line x1={sx + sw * 0.1} x2={sx + sw * 0.9} y1={sy + sh * 0.55} y2={sy + sh * 0.55} stroke="rgb(255 255 255 / 0.35)" strokeWidth={Math.max(0.6, sh * 0.02)} />
        {Array.from({ length: blocks }, (_, i) => (
          <rect
            key={i}
            x={sx + sw * 0.1 + bw * i + bw * 0.15}
            y={sy + sh * 0.43}
            width={bw * 0.7}
            height={sh * 0.24}
            rx={sh * 0.04}
            fill={SCENE_COLORS[(i * 3) % SCENE_COLORS.length]}
          />
        ))}
        <rect x={sx + sw * 0.06} y={sy + sh * 0.1} width={sw * 0.4} height={sh * 0.08} rx={sh * 0.03} fill="rgb(255 255 255 / 0.5)" />
        {spread(nK, w * 0.08, w * 0.92).map((cx, i) => (
          <Knob key={i} cx={cx} cy={ky} r={kr} p={p} turn={i} />
        ))}
        {switches}
      </>
    ),
    label: { x: w * 0.04, y: sy, w: Math.max(0, sx - w * 0.07), h: Math.min(sh * 0.45, 0.6 * IN), align: "left" },
  };
};

/** A footswitch box: a looper, a true bypass switcher or an amp's channel switch. Only switches and LEDs. */
const switcher: Draw = (w, h, u, p) => {
  const n = clamp(Math.round(w / (1.5 * IN)), 1, 12);
  const rows = h >= 4.5 * IN && n >= 3 ? 2 : 1;
  const top = h * 0.3;
  const zH = h * 0.95 - top;
  const cellW = (w * 0.92) / n;
  const cellH = zH / rows;
  const fsR = Math.min(cellW * 0.24, cellH * 0.25, 0.3 * IN);
  const ledR = Math.min(u * 0.035, 0.07 * IN);
  const parts: ReactNode[] = [];
  for (let ri = 0; ri < rows; ri++) {
    spread(n, w * 0.04, w * 0.96).forEach((cx, i) => {
      const cy = top + cellH * (ri + 0.62);
      parts.push(
        <g key={`${ri}-${i}`}>
          <Led cx={cx} cy={cy - fsR - ledR * 2.6} r={ledR} on={(ri + i) % 2 ? "#22c55e" : "#ff4d4d"} />
          <Footswitch cx={cx} cy={cy} r={fsR} p={p} />
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
    label: { x: w * 0.05, y: h * 0.05, w: w * 0.9, h: Math.min(h * 0.18, 0.5 * IN), align: "left" },
  };
};

const DRAW: Record<Exclude<PedalTemplate, "classic">, Draw> = { compact, hammond, wide, modeler, switcher };

const BODY_RADIUS: Record<Exclude<PedalTemplate, "classic">, number> = {
  compact: 0.05,
  hammond: 0.1,
  wide: 0.08,
  modeler: 0.04,
  switcher: 0.07,
};

function Label({ box, text, u, ink, flipX }: { box: LabelBox; text: string; u: number; ink: string; flipX?: boolean }) {
  if (!text || box.w <= 0 || box.h <= 0) return null;
  const size = Math.max(6, Math.min(box.h * 0.62, u * 0.12));
  return (
    <span
      className={`absolute flex items-center overflow-hidden leading-tight ${box.align === "left" ? "justify-start text-left" : "justify-center text-center"} ${box.bold ? "font-semibold" : "font-medium"}`}
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

/** The original custom pedal: two knobs, an LED, the name and one footswitch. Kept for pedals saved before templates. */
function Classic({ w, h, color, label, flipX }: { w: number; h: number; color: string; label: string; flipX?: boolean }) {
  const ink = readableOn(color);
  const u = Math.min(w, h);
  const knob = u * 0.22;
  const dot = (size: number, bg: string, extra: CSSProperties = {}): CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "50%",
    background: bg,
    ...extra,
  });
  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 78%, black))`,
        borderRadius: u * 0.07,
        boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.28), 0 1px 2px rgb(0 0 0 / 0.25)",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: h * 0.3, width: u * 0.05, height: u * 0.16, background: "#222", borderRadius: "0 2px 2px 0" }} />
      <span style={{ position: "absolute", right: 0, top: h * 0.3, width: u * 0.05, height: u * 0.16, background: "#222", borderRadius: "2px 0 0 2px" }} />
      <span style={dot(knob, "radial-gradient(circle at 35% 30%, #666, #1d1d1f)", { left: w * 0.2 - knob / 2, top: h * 0.1 })} />
      <span style={dot(knob, "radial-gradient(circle at 35% 30%, #666, #1d1d1f)", { left: w * 0.8 - knob / 2, top: h * 0.1 })} />
      <span style={dot(u * 0.07, "#ff4d4d", { left: w / 2 - u * 0.035, top: h * 0.1 + knob / 2 - u * 0.035, boxShadow: "0 0 4px #ff4d4d" })} />
      <span
        className="absolute inset-x-1 text-center font-medium leading-tight"
        style={{ top: h * 0.1 + knob + u * 0.08, fontSize: Math.max(7, u * 0.12), color: ink, overflowWrap: "anywhere", transform: flipX ? "scaleX(-1)" : undefined }}
      >
        {label}
      </span>
      <span
        style={dot(u * 0.34, "radial-gradient(circle at 35% 30%, #f4f4f5, #8a8a90)", {
          left: w / 2 - u * 0.17,
          bottom: h * 0.07,
          boxShadow: "0 1px 2px rgb(0 0 0 / 0.4)",
        })}
      />
    </div>
  );
}

/** Draws a custom pedal `w` × `h` canvas px in the given template. Missing template means Classic. */
export function PedalArt({
  template,
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
  const id = useId().replace(/:/g, "");
  if (!template || template === "classic") return <Classic w={w} h={h} color={color} label={label} flipX={flipX} />;
  const u = Math.min(w, h);
  const p: Paint = { knob: `url(#${id}k)`, metal: `url(#${id}m)` };
  const { parts, label: box } = DRAW[template](w, h, u, p, color);
  const rx = u * BODY_RADIUS[template];
  return (
    <div className="relative size-full" style={{ borderRadius: rx, boxShadow: "0 1px 2px rgb(0 0 0 / 0.25)" }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 block size-full" aria-hidden>
        <defs>
          <radialGradient id={`${id}k`} cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#6c6c72" />
            <stop offset="1" stopColor="#1d1d1f" />
          </radialGradient>
          <radialGradient id={`${id}m`} cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#fafafa" />
            <stop offset="1" stopColor="#8a8a90" />
          </radialGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={shade(color, 0.06)} />
            <stop offset="1" stopColor={shade(color, -0.22)} />
          </linearGradient>
          <clipPath id={`${id}c`}>
            <rect width={w} height={h} rx={rx} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}c)`}>
          <rect width={w} height={h} fill={`url(#${id}b)`} />
          {parts}
        </g>
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={rx} fill="none" stroke="rgb(0 0 0 / 0.3)" />
      </svg>
      {box && <Label box={box} text={label} u={u} ink={readableOn(color)} flipX={flipX} />}
    </div>
  );
}
