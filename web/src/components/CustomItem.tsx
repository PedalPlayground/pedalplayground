import { DEFAULT_PEDAL_COLOR } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import type { Item } from "../lib/types";
import { PedalArt } from "./PedalArt";

function CustomPedal({ item }: { item: Item }) {
  return (
    <PedalArt
      template={item.template}
      jacks={item.jacks}
      w={item.width * PX_PER_INCH}
      h={item.height * PX_PER_INCH}
      color={item.color ?? DEFAULT_PEDAL_COLOR}
      label={item.label}
      flipX={item.flipX}
    />
  );
}

/**
 * A generic pedalboard, styled like the original site: a dark deck framed by half-inch aluminum
 * U-channel. Lighter sides and darker ends meet on the diagonal, which reads as mitered corners.
 */
export function CustomBoard() {
  return (
    <div
      className="size-full"
      style={{
        border: `${PX_PER_INCH / 2}px solid #ddd`,
        borderTopColor: "#ccc",
        borderBottomColor: "#ccc",
        background: "#222",
      }}
    />
  );
}

export function CustomItemView({ item }: { item: Item }) {
  return item.kind === "pedalboard" ? <CustomBoard /> : <CustomPedal item={item} />;
}
