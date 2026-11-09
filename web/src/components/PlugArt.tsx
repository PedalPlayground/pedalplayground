import pancakeArt from "../assets/plugs/pancake.svg";
import reanArt from "../assets/plugs/rean.svg";
import sp400Art from "../assets/plugs/sp400.svg";
import { PX_PER_INCH } from "../lib/geometry";
import { ART_INCH_PER_UNIT, BARREL, BARREL_STUB, knownType, PLUG_TYPES, SIDE_ANGLE, type Plug } from "../lib/plugs";

/** The same drawings as Space Between's plug guide. */
export const ART_SRC = { rean: reanArt, sp400: sp400Art, pancake: pancakeArt };

/** The cable's length past the plug head, in inches (it fades out). */
const CABLE = 1.1;
/** The drawings' grays, so the drawn-in-code plugs match them. */
const BODY = "#6C6C6C";
const SHADE = "#535353";
const METAL = "#C4C4C4";
const CABLE_COLOR = "#4a4a4a";

/**
 * One plug drawn at real scale, pointing up out of an edge from (0, 0): the head, then a short cable that fades out.
 * Right-angle plugs use the plug-guide drawings and turn their cable sideways (mirrored when `flip`), or point it down
 * into the board (`down`, drawn as the cap seen from above). Inch units; the caller scales it.
 */
export function PlugShape({ plug }: { plug: Plug }) {
  const type = knownType(plug.type);
  const spec = PLUG_TYPES[type];
  const w = spec.width;
  const l = spec.length;
  const fade = `plug-fade-${plug.id}`;
  const cable = (d: string) => <path d={d} stroke={`url(#${fade})`} strokeWidth={0.2} strokeLinecap="round" fill="none" />;
  // A little barrel running into the jack: hidden under the pedal, except where the photo leaves it showing.
  const barrel = <rect x={-BARREL / 2} y={-0.05} width={BARREL} height={BARREL_STUB + 0.05} rx={0.03} fill={METAL} />;

  if (spec.art && plug.down) {
    // Cable down: from above only the plug's cap shows; the cable drops away under it.
    const k = ART_INCH_PER_UNIT;
    const half = (spec.art.downWidth / 2) * k;
    return (
      <g>
        {barrel}
        <rect x={-half} y={-l} width={half * 2} height={l} rx={Math.min(half, l) * 0.35} fill={BODY} />
        <rect x={0} y={-l} width={half} height={l} rx={Math.min(half, l) * 0.35} fill={SHADE} />
        <rect x={0} y={-l} width={Math.min(half, l) * 0.35} height={l} fill={SHADE} />
        {/* The cap's rounded top catching the light. */}
        <rect x={-half + 0.05} y={-l + 0.05} width={half - 0.05} height={l - 0.1} rx={Math.min(half, l) * 0.3} fill="#ffffff" opacity={0.08} />
      </g>
    );
  }

  if (spec.art) {
    const a = spec.art;
    const k = ART_INCH_PER_UNIT;
    // The cable leaves the far end of the body, from the middle of its thickness.
    const end = (a.h - a.cy) * k;
    const mid = -((a.w - a.x0) / 2) * k;
    const stub = BARREL_STUB / k;
    return (
      <g transform={plug.flip ? "scale(-1 1)" : undefined}>
        <defs>
          <linearGradient id={fade} x1={end} x2={end + CABLE} y1={0} y2={0} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={CABLE_COLOR} />
            <stop offset="1" stopColor={CABLE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        {cable(`M${end - 0.1} ${mid} H${end + CABLE}`)}
        {/* The drawing turned so its barrel points into the pedal, cut to a short stub of barrel. */}
        <g transform={`scale(${k}) rotate(-90) translate(${-a.x0} ${-a.cy})`}>
          <svg x={a.x0 - stub} y={0} width={a.w - a.x0 + stub} height={a.h} viewBox={`${a.x0 - stub} 0 ${a.w - a.x0 + stub} ${a.h}`} overflow="hidden">
            <image href={ART_SRC[a.name]} x={0} y={0} width={a.w} height={a.h} />
          </svg>
        </g>
      </g>
    );
  }

  return (
    <g>
      <defs>
        <linearGradient id={fade} x1={0} x2={0} y1={-l} y2={-l - CABLE} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={CABLE_COLOR} />
          <stop offset="1" stopColor={CABLE_COLOR} stopOpacity={0} />
        </linearGradient>
      </defs>
      {cable(`M0 ${-l} V${-l - CABLE}`)}
      {barrel}
      <rect x={-0.13} y={-l - 0.05} width={0.26} height={0.5} rx={0.06} fill={SHADE} />
      <rect x={-w / 2} y={-l + 0.35} width={w} height={l - 0.55} rx={0.1} fill={BODY} />
      <rect x={0} y={-l + 0.35} width={w / 2} height={l - 0.55} fill={SHADE} />
      <rect x={-w / 2 + 0.03} y={-0.24} width={w - 0.06} height={0.24} rx={0.03} fill={METAL} />
    </g>
  );
}

/** How far any plug reaches from its edge, cable included, in inches (for the drawing's box). */
const REACH = 3;

/**
 * A pedal's plugs, drawn in its own (unrotated, unflipped) box of `w` × `h` inches, so they turn and flip with it.
 * Draws outside the box; it never takes clicks (the editor has its own handles).
 */
export function PlugsLayer({ plugs, w, h }: { plugs: Plug[]; w: number; h: number }) {
  if (!plugs.length) return null;
  const s = PX_PER_INCH;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute overflow-visible"
      style={{ left: -REACH * s, top: -REACH * s, width: (w + 2 * REACH) * s, height: (h + 2 * REACH) * s }}
      viewBox={`${-REACH} ${-REACH} ${w + 2 * REACH} ${h + 2 * REACH}`}
    >
      {plugs.map((p) => {
        const [x, y] = p.side === "top" ? [p.at, 0] : p.side === "bottom" ? [p.at, h] : p.side === "left" ? [0, p.at] : [w, p.at];
        return (
          <g key={p.id} transform={`translate(${x} ${y}) rotate(${SIDE_ANGLE[p.side]})`}>
            <PlugShape plug={p} />
          </g>
        );
      })}
    </svg>
  );
}
