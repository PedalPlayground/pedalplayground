const { chromium } = require('playwright');
// Renders the home screen and tab icons into public/icons/<env>/: the header logo mark (from the Figma mockup) on the
// dotted canvas, plus a BETA or LOCAL band. Needs Playwright and the local catalog (for the pedal image).
// Run from web/: node scripts/icons/render.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '../../public/icons');
const PEDAL = path.join(__dirname, '../../public/catalog/img/walrus-julianna.7200f0a2.webp');
const BOARD = "M24 16H0V0H24V16ZM2.08696 11V13H21.913V11H2.08696ZM2.08696 7V9H21.913V7H2.08696ZM2.08696 3V5H21.913V3H2.08696Z";
const pedal = 'data:image/webp;base64,' + fs.readFileSync(PEDAL).toString('base64');
const bands = { prod: null, beta: ['BETA', '#ffb020', '#111'], local: ['LOCAL', '#12b76a', '#fff'] };
function html(env) {
  const band = bands[env];
  const s = 4.5; // 32x24 logo mark -> 144x108
  const area = band ? 136 : 180;
  const left = (180 - 32 * s) / 2, top = (area - 24 * s) / 2 + (band ? 2 : 0);
  const h = (x, y) => `<div style="position:absolute;left:${x * s}px;top:${y * s}px;width:${3 * s}px;height:${3 * s}px;background:#5c62fc"></div>`;
  return `<div id=icon style="position:relative;width:180px;height:180px;overflow:hidden;background-color:#f8f8f8;
      background-image:radial-gradient(circle at 2px 2px,#d4d4d4 1.4px,transparent 1.9px);background-size:15px 15px;background-position:4px 4px">
    <div style="position:absolute;left:${left}px;top:${top}px;width:${32 * s}px;height:${24 * s}px">
      <div style="position:absolute;left:${s}px;top:${s}px;width:${30 * s}px;height:${22 * s}px;box-sizing:border-box;border:${1.5 * s}px solid #5c62fc"></div>
      ${h(0, 0)}${h(29, 0)}${h(0, 21)}${h(29, 21)}
      <svg style="position:absolute;left:${4 * s}px;top:${4 * s}px" width="${24 * s}" height="${16 * s}" viewBox="0 0 24 16"><path fill="#2F2F31" fill-rule="evenodd" d="${BOARD}"/></svg>
      <img src="${pedal}" style="position:absolute;right:${5 * s}px;top:${5 * s}px;height:${13.64 * s}px;width:auto">
    </div>
    ${band ? `<div style="position:absolute;left:0;right:0;bottom:0;height:44px;background:${band[1]};color:${band[2]};font:800 26px/44px 'DM Sans',Helvetica,Arial,sans-serif;letter-spacing:3px;text-align:center">${band[0]}</div>` : ''}
  </div>`;
}
(async () => {
  const b = await chromium.launch();
  for (const env of ['prod', 'beta', 'local']) {
    for (const size of [180, 192, 512, 32]) {
      const p = await b.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: size / 180 });
      await p.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@800&display=block" rel="stylesheet"></head><body style="margin:0">${html(env)}</body></html>`);
      await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
      await p.locator('#icon').screenshot({ path: path.join(OUT, env, size === 180 ? 'apple-touch-icon.png' : size === 32 ? 'favicon-32.png' : `icon-${size}.png`) });
      await p.close();
    }
  }
  await b.close();
})();
