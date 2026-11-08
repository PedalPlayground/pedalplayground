import { Fragment, type ReactNode } from "react";

/**
 * Short facts on one line ("BOSS  2.8″ × 5.1″  Pedalboard"), set apart by space instead of dots, bars or dashes.
 * Empty parts are skipped. Wrap it in whatever sets the text style (and `truncate`, which still works).
 */
export function Meta({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <>
      {shown.map((p, i) => (
        <Fragment key={i}>{i === 0 ? p : <span className="ml-2.5">{p}</span>}</Fragment>
      ))}
    </>
  );
}
