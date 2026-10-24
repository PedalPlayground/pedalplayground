# UI sizing conventions

The sizes the app already uses almost everywhere. Keep new UI to these so it stays consistent.

| What | Size |
| --- | --- |
| Buttons, text fields, icon buttons, menu triggers | 36px tall (`h-9`, `size-9`); icon buttons are 36×36 |
| Body and control text | `text-sm` (14px); labels, metadata, the zoom readout and the Beta badge use `text-xs` (12px) |
| Dialog titles | `text-base font-semibold` |
| Corner radius | controls 8px (`rounded-control`), panels and menus 12px (`rounded-panel`), avatar and color dots fully round |
| Header | 48px tall: 16px logo with 16px above and below |
| Avatar | 24px box; the pedal keeps its own proportions |
| Segmented toggle (units) | 24px buttons, `text-xs`, inside a 8px-radius track |

Known exceptions: the playground thumbnail in the switcher is 32px with a small radius, and the sign-in code field uses `text-lg` with wide letter spacing on purpose.
