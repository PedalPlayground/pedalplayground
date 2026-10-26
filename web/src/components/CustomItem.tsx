import { DEFAULT_PEDAL_COLOR, readableOn } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import type { Item } from "../lib/types";

/** A generic pedal: colored body with knobs, LED, footswitch, jacks and its name. */
function CustomPedal({ item }: { item: Item }) {
  const w = item.width * PX_PER_INCH;
  const h = item.height * PX_PER_INCH;
  const color = item.color ?? DEFAULT_PEDAL_COLOR;
  const ink = readableOn(color);
  const u = Math.min(w, h); // sizing unit so details scale with the smaller side
  const knob = u * 0.22;
  const dot = (size: number, bg: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
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
      {/* jacks */}
      <span style={{ position: "absolute", left: 0, top: h * 0.3, width: u * 0.05, height: u * 0.16, background: "#222", borderRadius: "0 2px 2px 0" }} />
      <span style={{ position: "absolute", right: 0, top: h * 0.3, width: u * 0.05, height: u * 0.16, background: "#222", borderRadius: "2px 0 0 2px" }} />
      {/* knobs */}
      <span style={dot(knob, "radial-gradient(circle at 35% 30%, #666, #1d1d1f)", { left: w * 0.2 - knob / 2, top: h * 0.1 })} />
      <span style={dot(knob, "radial-gradient(circle at 35% 30%, #666, #1d1d1f)", { left: w * 0.8 - knob / 2, top: h * 0.1 })} />
      {/* LED */}
      <span style={dot(u * 0.07, "#ff4d4d", { left: w / 2 - u * 0.035, top: h * 0.1 + knob / 2 - u * 0.035, boxShadow: "0 0 4px #ff4d4d" })} />
      {/* name */}
      <span
        className="absolute inset-x-1 text-center font-medium leading-tight"
        style={{ top: h * 0.1 + knob + u * 0.08, fontSize: Math.max(7, u * 0.12), color: ink, overflowWrap: "anywhere", transform: item.flipX ? "scaleX(-1)" : undefined }}
      >
        {item.label}
      </span>
      {/* footswitch */}
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

/**
 * A generic pedalboard, styled like the original site: a dark deck framed by half-inch aluminum
 * U-channel. Lighter sides and darker ends meet on the diagonal, which reads as mitered corners.
 */
function CustomBoard({ item }: { item: Item }) {
  return (
    <div
      className="size-full"
      style={{
        border: `${PX_PER_INCH / 2}px solid #ddd`,
        borderTopColor: "#ccc",
        borderBottomColor: "#ccc",
        background: "#222",
      }}
      title={item.label}
    />
  );
}

export function CustomItemView({ item }: { item: Item }) {
  return item.kind === "pedalboard" ? <CustomBoard item={item} /> : <CustomPedal item={item} />;
}
