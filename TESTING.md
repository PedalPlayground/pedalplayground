# Testing

`tests/browser.test.js` drives the site in headless Chromium with [Playwright](https://playwright.dev/). It checks group selection, custom pedal units, the settings menu, the units switch, save/load and undo/redo.

## Set up Playwright (once)

Playwright isn't a dependency of this project, so install it somewhere else:

```sh
mkdir -p ~/playwright && cd ~/playwright
npm init -y
npm install playwright
npx playwright install chromium
```

## Run the tests

1. Start the site from the project directory:

   ```sh
   npm start
   ```

   browser-sync prints a `Local:` URL. It uses port 3000, or the next free port if 3000 is taken.

2. In a second terminal, run the tests. Point `PLAYWRIGHT` at your install, and `BASE_URL` at the `Local:` URL:

   ```sh
   PLAYWRIGHT=~/playwright/node_modules/playwright \
   BASE_URL=http://localhost:3000/ \
   node tests/browser.test.js
   ```

   `BASE_URL` defaults to `http://localhost:3001/`.

## Reading the output

Each check prints `PASS` or `FAIL`. A failing check also prints the state it found. The run ends with a count, and exits with code 1 if any check failed.

Each section opens a fresh page with an empty saved canvas. Page errors and unexpected dialogs count as failures.

`checking 'Use mm' switches panel dimensions to mm` fails on the current code, independently of the undo/redo work.

## Adding tests

Add an `async function mySection(b)` that starts with `const p = await freshPage(b);` and records results with `ok(condition, message, extra)`. Call it from the runner at the bottom of the file. `saveLoad` and `undoRedo` are good models.

Things to watch for:

- `p.mouse.click` ignores modifier keys. To click with a modifier, hold it with `p.keyboard.down()` around the click.
- Hidden inputs can't be focused, such as fields in a collapsed sidebar section. Show them first, as the Ctrl-Z text-field check in `undoRedo` does.
- `window.ga` is stubbed out, so analytics calls don't fail.
