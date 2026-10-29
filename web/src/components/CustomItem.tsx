import { DEFAULT_PEDAL_COLOR } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import { boardStyle, finishBackground, topBackground, type BoardStyle } from "../lib/boardStyles";
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
 * A custom pedalboard: a deck (black ABS, Velcro or wood grain) inside an optional frame (aluminum, black metal
 * or tolex) of the chosen thickness. Without options it's the original look: half-inch aluminum around a dark deck.
 */
export function CustomBoard({ board }: { board?: Partial<BoardStyle> }) {
  const b = boardStyle(board);
  const bw = b.border ? b.borderWidth * PX_PER_INCH : 0;
  return (
    <div className="size-full" style={b.border ? { ...finishBackground(b.finish), padding: bw } : undefined}>
      <div
        className="size-full"
        style={{ ...topBackground(b.top), boxShadow: b.border ? "inset 0 0 0 1px rgb(0 0 0 / 0.35), inset 0 2px 6px rgb(0 0 0 / 0.35)" : undefined }}
      />
    </div>
  );
}

export function CustomItemView({ item }: { item: Item }) {
  return item.kind === "pedalboard" ? <CustomBoard board={item.board} /> : <CustomPedal item={item} />;
}
