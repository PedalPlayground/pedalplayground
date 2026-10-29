# To do

Open items in priority order, highest first.
The larger prioritized plan lives in `docs/handoff.md` ("Prioritized next steps").

## Open

1. Make signed in/out status more clear.
2. Polish the Pro purchase modal.
3. Better sign-in success UX.
4. Finesse the design library (buttons and form elements are a bit sterile).
5. Make the sign-in flow more complete.
6. Sign-in: after sending a code, show the address it went to with a "Wrong address? Change it" link (a mistyped address looks like a broken email).
7. Improve contrast in dark mode.
8. Address canvas zoom going out of bounds.
9. Z-index minimap.
10. Custom illustrations for the custom pedal styles (Trav to draw; current flat SVG styles are placeholders).
11. Move the action notifications (toasts) to the top right of the canvas.
12. Color action notifications: green for successful actions, red for failed ones.
13. Help menu (bottom right of the canvas):
    - Take the tour again.
    - A Keyboard Shortcuts cheat sheet, including mouse and tap gestures. Keep a running checklist of the shortcuts
      each person has already used, so they can knock them out one by one.
14. Support logging in by username/password, and maybe Google/Apple auth.
15. Tour first screen: a short looping demo video (or a lighter format if better) in the top half of the modal,
    optimized for size and load time. Aimed at returning users seeing the new UI and at brand new users.
16. Make an artifact of all the UI copy on the site, so Trav can audit and tweak tone and voice.
17. Establish tone and voice.
18. Bug: clicking the Signal Path button in the mode rail hides its tooltip.
19. Audit colors so the grays and blacks share the main blurple's hue, and build a brand palette with shades of each
    color, named the industry-standard way (e.g. `brand-50` to `brand-950`).
20. Add a button to suggest a catalog pedalboard (or a custom one) when multiple pedals are selected.
21. Equipment List Buy links (step 4): a Buy button on Need to Buy items that opens a Reverb search through an
    affiliate link, with a disclosure line. Waits on Trav's Reverb approval on Awin.
22. Two catalog pedals appear twice with different images or sizes: Kingtone The Octaland (4.7″ vs 5.09″ wide) and
    MXR Super Comp (two images). Check which are real variants, and rename or remove the rest.
23. A way to reset your password.

## Done

- Keyboard navigation in the pedal search (arrows, Enter, Escape).
- Snap guides get stuck sometimes.
- Onboarding popups (first-visit tour; replay from Settings → Take the tour).
- Better-looking custom pedals (style templates, plus Edit for custom pedals and pedalboards).
