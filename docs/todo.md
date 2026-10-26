# To do

Things noticed while testing, logged to address later. Newest at the bottom of each section.
The larger prioritized plan lives in `docs/handoff.md` ("Prioritized next steps").

## From the beta smoke test

- Make signed in/out status more clear.
- Polish the Pro purchase modal.
- Better sign-in success UX.
- Finesse the design library (buttons and form elements are a bit sterile).
- Make the sign-in flow more complete.
- Sign-in: after sending a code, show the address it went to with a "Wrong address? Change it" link (a mistyped address looks like a broken email).
- Improve contrast in dark mode.
- Address canvas zoom going out of bounds.
- Z-index minimap.

- Custom illustrations for the custom pedal styles (Trav to draw; current flat SVG styles are placeholders).

## Other

- Move the action notifications (toasts) to the top right of the canvas.
- Color action notifications: green for successful actions, red for failed ones.
- Help menu (bottom right of the canvas):
  - Take the tour again.
  - A Keyboard Shortcuts cheat sheet, including mouse and tap gestures. Keep a running checklist of the shortcuts
    each person has already used, so they can knock them out one by one.
- Support logging in by username/password, and maybe Google/Apple auth.
- Tour first screen: a short looping demo video (or a lighter format if better) in the top half of the modal,
  optimized for size and load time. Aimed at returning users seeing the new UI and at brand new users.
- Make an artifact of all the UI copy on the site, so Trav can audit and tweak tone and voice.
- Establish tone and voice.
- Bug: clicking the Signal Path button in the mode rail hides its tooltip.
- Audit colors so the grays and blacks share the main blurple's hue, and build a brand palette with shades of each
  color, named the industry-standard way (e.g. `brand-50` to `brand-950`).

## Done

- Snap guides get stuck sometimes.
- Onboarding popups (first-visit tour; replay from Settings → Take the tour).
- Better-looking custom pedals (style templates, plus Edit for custom pedals and pedalboards).
