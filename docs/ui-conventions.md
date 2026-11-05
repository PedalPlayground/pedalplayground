# UI conventions

The sizes the app already uses almost everywhere. Keep new UI to these so it stays consistent.

| What | Size |
| --- | --- |
| Buttons, text fields, icon buttons, menu triggers | 36px tall (`h-9`, `size-9`); icon buttons are 36×36 |
| Body and control text | `text-sm` (14px); metadata, the zoom readout and the Beta badge use `text-xs` (12px) |
| Form fields | `components/formText.ts`: label 13px semibold at 80% ink, help text (12px, muted) right under the label, the field, then any error (12px, red) under the field. Help and error are linked to the field with `aria-describedby` |
| Dialog titles | `text-base font-semibold` |
| Primary button | `btn-primary` (index.css), from the Figma button: purple `#5B61FB` with a lighter `#6D72F6` highlight in its top ~1px (the gradient border), `0 1px 1px` shadow at 14% black, faint text shadow, semibold, 4px radius (same as every control) |
| Corner radius | controls 4px (`rounded-control`), panels and menus 12px (`rounded-panel`), avatar and color dots fully round |
| Header | Tablet and desktop: 48px tall bar with the 16px logo (16px above and below), save status, account and settings. Phones: no header; account and settings float top-right in a small pill |
| Avatar | 24px box; the pedal keeps its own proportions |
| Segmented toggle (units) | 24px buttons, `text-xs`, inside a 4px-radius track |

Known exceptions: the playground thumbnail in the switcher is 32px with a small radius, and the sign-in code field uses `text-lg` with wide letter spacing on purpose.

Phones (below 640px): floating glass bars (`glass`, `glass-sm` in index.css) with fully rounded ends; the Place button floats apart from the bar as a purple circle; the logo and zoom readout are hidden.

## Keep it consistent

When you change how something looks or behaves, find every other place that shows the same thing and change those
too, in the same commit. If one of them should stay different, say so and ask; don't leave it out silently. The list
below is where this has bitten before. Add to it when you find another.

| Pattern | Where it lives | Also update |
| --- | --- | --- |
| Form label, help text, error, text field | `components/formText.ts` | Every dialog form: Account (Sign In, Create Account, account view), `SetPasswordForm` (Change Password and after a reset), `UsernamePrompt`, `NewPlaygroundDialog`, `EditPlaygroundDialog`. New and Edit Playground still have their own `field` style. |
| Dialog shell and backdrop | `components/Modal.tsx`, `.modal-backdrop` in `index.css` | Dialogs built by hand: `OnboardingTour`, `SpaceBetweenPanel`. Text placed on the backdrop (the `footer` under a dialog) must use theme colors, since the backdrop is light in light mode. |
| Add Gear / Replace / Edit | `components/SearchPanel.tsx` | It has two layouts: the desktop side panel and the phone sheet. Change both, and check all three modes in each. On phones all three leave the canvas undimmed and fit it above the sheet. |
| Sign-in, account and password dialogs | `AccountDialog`, `SetPasswordForm`, `UsernamePrompt` | They're rendered by both `App.tsx` and `gallery/GalleryApp.tsx`. A dialog added to one page usually belongs on the other. |
| Auth emails | `docs/auth-email-template.html`, `docs/auth-reset-template.html` | The two share one layout. Change both, then paste them into Supabase (Authentication → Email Templates). Their images are in `web/public/email`. |
| Logo | `assets/logo.svg`, `components/Logo.tsx`, `.app-logo` in `index.css` (dark mode) | `web/public/email/logo-*.png` (exported from the Figma header logo, light and dark), favicons in `public/icons`, `public/social.jpg`. |
| Theme colors | `index.css` | Dark mode is defined twice (following the OS, and when picked in Settings), and OLED black twice more. Change all of them. The email templates copy the colors, and `index.html` has its own `theme-color`. |
| Soft gray button | `barSoftButton` in `components/toolbarStyles.ts` | The same colors are copied into `SiteTabs` (guest buttons) and `EquipmentList`. |
| Floating pill text (toasts, canvas hints) | `components/ActionToast.tsx`, `components/Tooltip.tsx` | They use the same pill style. Change both. |
