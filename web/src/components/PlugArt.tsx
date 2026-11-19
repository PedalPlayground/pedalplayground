import barrelDownArt from "../assets/plugs/barrel-down.svg";
import dinDownArt from "../assets/plugs/din-down.svg";
import miniDownArt from "../assets/plugs/mini-down.svg";
import pancakeDownArt from "../assets/plugs/pancake-down.svg";
import reanDownArt from "../assets/plugs/rean-down.svg";
import sp400DownArt from "../assets/plugs/sp400-down.svg";
import { PX_PER_INCH } from "../lib/geometry";
import { ART_INCH_PER_UNIT, BARREL_STUB, knownType, PLUG_TYPES, SIDE_ANGLE, type Plug } from "../lib/plugs";

/** Trav's top-down drawings of the plug guide's plugs (Space Between), cable dropping under the board. */
export const ART_SRC = {
  "rean-down": reanDownArt,
  "sp400-down": sp400DownArt,
  "pancake-down": pancakeDownArt,
  // Placeholders until Trav's drawings.
  "mini-down": miniDownArt,
  "barrel-down": barrelDownArt,
  "din-down": dinDownArt,
};

/**
 * One plug drawn at real scale, seen from above, pointing up out of an edge from (0, 0): its drawing turned so the
 * barrel goes into the jack, cut to a short stub of barrel. Inch units; the caller scales it.
 */
export function PlugShape({ plug }: { plug: Plug }) {
  const a = PLUG_TYPES[knownType(plug.type)].art;
  const k = ART_INCH_PER_UNIT;
  const stub = BARREL_STUB / k;
  return (
    <g transform={`scale(${k}) rotate(-90) translate(${-a.x0} ${-a.cy})`}>
      <svg x={a.x0 - stub} y={0} width={a.w - a.x0 + stub} height={a.h} viewBox={`${a.x0 - stub} 0 ${a.w - a.x0 + stub} ${a.h}`} overflow="hidden">
        <image href={ART_SRC[a.name]} x={0} y={0} width={a.w} height={a.h} />
      </svg>
    </g>
  );
}

/** How far any plug reaches from its edge, in inches (for the drawing's box). */
const REACH = 1;

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
