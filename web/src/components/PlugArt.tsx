import { PX_PER_INCH } from "../lib/geometry";
import { PLUG_TYPES, SIDE_ANGLE, type Plug } from "../lib/plugs";

/** The cable's length past the plug head, in inches (it fades out). */
const CABLE = 1.1;
const BODY = "#1d1e22";
const METAL = "#b9bbc2";
const CABLE_COLOR = "#2a2b30";

/**
 * One plug drawn at real scale, pointing up out of an edge from (0, 0): the head, then a short cable that fades out.
 * Angled and pancake plugs turn their cable sideways (mirrored when `flip`). Inch units; the caller scales it.
 */
export function PlugShape({ plug }: { plug: Plug }) {
  const spec = PLUG_TYPES[plug.type];
  const w = spec.width;
  const l = spec.length;
  const fade = `plug-fade-${plug.id}`;
  const dir = plug.flip ? -1 : 1;
  const cable = (d: string) => <path d={d} stroke={`url(#${fade})`} strokeWidth={0.2} strokeLinecap="round" fill="none" />;
  return (
    <g>
      <defs>
        {spec.sideways ? (
          <linearGradient id={fade} x1={0} x2={dir * (CABLE + w / 2)} y1={0} y2={0} gradientUnits="userSpaceOnUse">
            <stop offset="0.35" stopColor={CABLE_COLOR} />
            <stop offset="1" stopColor={CABLE_COLOR} stopOpacity={0} />
          </linearGradient>
        ) : (
          <linearGradient id={fade} x1={0} x2={0} y1={-l} y2={-l - CABLE} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={CABLE_COLOR} />
            <stop offset="1" stopColor={CABLE_COLOR} stopOpacity={0} />
          </linearGradient>
        )}
      </defs>
      {plug.type === "straight" && (
        <>
          {cable(`M0 ${-l} V${-l - CABLE}`)}
          <rect x={-0.13} y={-l - 0.05} width={0.26} height={0.5} rx={0.06} fill={BODY} />
          <rect x={-w / 2} y={-l + 0.35} width={w} height={l - 0.55} rx={0.1} fill={BODY} />
          <rect x={-w / 2 + 0.03} y={-0.24} width={w - 0.06} height={0.24} rx={0.03} fill={METAL} />
        </>
      )}
      {plug.type === "angle" && (
        <>
          {cable(`M0 ${-l + 0.22} H${dir * (CABLE + w / 2)}`)}
          <rect x={-w / 2} y={-l} width={w} height={l - 0.18} rx={0.12} fill={BODY} />
          <rect x={dir > 0 ? w / 2 - 0.05 : -w / 2 - 0.25} y={-l + 0.1} width={0.3} height={0.24} rx={0.05} fill={BODY} />
          <rect x={-w / 2 + 0.06} y={-0.2} width={w - 0.12} height={0.2} rx={0.03} fill={METAL} />
        </>
      )}
      {plug.type === "pancake" && (
        <>
          {cable(`M0 ${-l / 2} H${dir * (CABLE + w / 2)}`)}
          <rect x={-w / 2} y={-l} width={w} height={l} rx={l / 2} fill={BODY} />
          <circle cx={0} cy={-l / 2} r={0.08} fill={METAL} />
        </>
      )}
      {plug.type === "dc" && (
        <>
          {cable(`M0 ${-l} V${-l - CABLE}`)}
          <rect x={-w / 2} y={-l} width={w} height={l - 0.15} rx={0.08} fill={BODY} />
          <rect x={-w / 2 + 0.06} y={-0.15} width={w - 0.12} height={0.15} fill={METAL} />
        </>
      )}
      {plug.type === "midi" && (
        <>
          {cable(`M0 ${-l} V${-l - CABLE}`)}
          <rect x={-0.13} y={-l - 0.05} width={0.26} height={0.4} rx={0.06} fill={BODY} />
          <rect x={-w / 2} y={-l + 0.25} width={w} height={l - 0.4} rx={0.18} fill={BODY} />
          <rect x={-w / 2 + 0.04} y={-0.15} width={w - 0.08} height={0.15} rx={0.03} fill={METAL} />
        </>
      )}
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
