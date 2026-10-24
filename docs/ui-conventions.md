# UI sizing conventions

The sizes the app already uses almost everywhere. Keep new UI to these so it stays consistent.

| What | Size |
| --- | --- |
| Buttons, text fields, icon buttons, menu triggers | 36px tall (`h-9`, `size-9`); icon buttons are 36×36 |
| Body and control text | `text-sm` (14px); labels, metadata, the zoom readout and the Beta badge use `text-xs` (12px) |
| Dialog titles | `text-base font-semibold` |
| Primary button | `btn-primary` (index.css), from the Figma button: purple `#5B61FB` with a lighter `#6D72F6` highlight in its top ~1px (the gradient border), `0 1px 1px` shadow at 14% black, faint text shadow, semibold, 4px radius |
| Corner radius | controls 8px (`rounded-control`), panels and menus 12px (`rounded-panel`), avatar and color dots fully round |
| Header | 48px tall: 16px logo with 16px above and below |
| Avatar | 24px box; the pedal keeps its own proportions |
| Segmented toggle (units) | 24px buttons, `text-xs`, inside a 8px-radius track |

Known exceptions: the playground thumbnail in the switcher is 32px with a small radius, and the sign-in code field uses `text-lg` with wide letter spacing on purpose.
