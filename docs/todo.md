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
8. Z-index minimap.
9. Custom illustrations for the custom pedal styles (Trav to draw; current flat SVG styles are placeholders).
10. Move the action notifications (toasts) to the top right of the canvas.
11. Color action notifications: green for successful actions, red for failed ones.
12. Help menu (bottom right of the canvas):
    - Take the tour again.
    - A Keyboard Shortcuts cheat sheet, including mouse and tap gestures. Keep a running checklist of the shortcuts
      each person has already used, so they can knock them out one by one.
13. Support logging in by username/password, and maybe Google/Apple auth.
14. Tour first screen: a short looping demo video (or a lighter format if better) in the top half of the modal,
    optimized for size and load time. Aimed at returning users seeing the new UI and at brand new users.
15. Make an artifact of all the UI copy on the site, so Trav can audit and tweak tone and voice.
16. Establish tone and voice.
17. Bug: clicking the Signal Path button in the mode rail hides its tooltip.
18. Audit colors so the grays and blacks share the main blurple's hue, and build a brand palette with shades of each
    color, named the industry-standard way (e.g. `brand-50` to `brand-950`).
19. Add a button to suggest a catalog pedalboard (or a custom one) when multiple pedals are selected.
20. Equipment List Buy links (step 4): a Buy button on Need to Buy items that opens a Reverb search through an
    affiliate link, with a disclosure line. Waits on Trav's Reverb approval on Awin.
21. Two catalog pedals appear twice with different images or sizes: Kingtone The Octaland (4.7″ vs 5.09″ wide) and
    MXR Super Comp (two images). Check which are real variants, and rename or remove the rest.
22. Multiple languages (translate the site's UI). Post-MVP, not yet prioritized.
23. Two tiered pedalboards with a hinged shelf. Post-MVP, not yet prioritized.
24. A way to reset your password.
25. Bug: some thumbnails in the My Playgrounds menu are blank (reported by Trav 2026-11-08).
26. Bug: boards show the wrong image (reported by Trav 2026-11-08; where and which boards still to confirm).
27. Bug: opening a playground briefly flashes an old board before the right one loads (reported by Trav 2026-11-08).
28. Catalog: 11 entries share an image with another entry (pedalboards aclam-l2-free, aclam-s2-top; pedals barefoot-button,
    ernie-ball-vp, zip-tie-mount-lg, mission-ep1, mission-ep1-black, mooer-leveline, mxr-csp102sl, mxr-csp026 and one more).
    The second of each pair shows the other's photo, and its Gear page (`?item=<image>`) opens the first one instead.

## Done

- Canvas zoom going out of bounds: panning keeps the board in view, and zooming out stops once it fits.
- Keyboard navigation in the pedal search (arrows, Enter, Escape).
- Snap guides get stuck sometimes.
- Onboarding popups (first-visit tour; replay from Settings → Take the tour).
- Better-looking custom pedals (style templates, plus Edit for custom pedals and pedalboards).
