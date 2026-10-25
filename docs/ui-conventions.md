# UI sizing conventions

The sizes the app already uses almost everywhere. Keep new UI to these so it stays consistent.

| What | Size |
| --- | --- |
| Buttons, text fields, icon buttons, menu triggers | 36px tall (`h-9`, `size-9`); icon buttons are 36×36 |
| Body and control text | `text-sm` (14px); labels, metadata, the zoom readout and the Beta badge use `text-xs` (12px) |
| Dialog titles | `text-base font-semibold` |
| Primary button | `btn-primary` (index.css), from the Figma button: purple `#5B61FB` with a lighter `#6D72F6` highlight in its top ~1px (the gradient border), `0 1px 1px` shadow at 14% black, faint text shadow, semibold, 4px radius (same as every control) |
| Corner radius | controls 4px (`rounded-control`), panels and menus 12px (`rounded-panel`), avatar and color dots fully round |
| Header | Tablet and desktop: 48px tall bar with the 16px logo (16px above and below), save status, account and settings. Phones: no header; account and settings float top-right in a small pill |
| Avatar | 24px box; the pedal keeps its own proportions |
| Segmented toggle (units) | 24px buttons, `text-xs`, inside a 4px-radius track |

Known exceptions: the playground thumbnail in the switcher is 32px with a small radius, and the sign-in code field uses `text-lg` with wide letter spacing on purpose.

Phones (below 640px): floating glass bars (`glass`, `glass-sm` in index.css) with fully rounded ends; the Place button floats apart from the bar as a purple circle; the logo and zoom readout are hidden.
