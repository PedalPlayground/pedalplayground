// Browser tests for group selection, custom pedal units, the settings menu,
// the units switch and save/load.
//
// Needs the site running (npm start) and Playwright with Chromium installed.
// Playwright isn't a dependency of this project, so point PLAYWRIGHT at an install:
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tests/browser.test.js
//
// BASE_URL defaults to http://localhost:3001/. Exits with code 1 if any check fails.

const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE_URL = process.env.BASE_URL || "http://localhost:3001/";

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m + (extra !== undefined && !c ? "  " + JSON.stringify(extra) : "")); };

// Fresh page with an empty saved canvas. Errors and dialogs are collected in page.errs.
async function freshPage(b) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(() => { window.ga = function () {}; });
  const p = await ctx.newPage();
  p.errs = [];
  p.on("pageerror", e => p.errs.push(e.message));
  p.on("dialog", d => { p.errs.push("DIALOG " + d.message()); d.dismiss(); });
  await p.goto(BASE_URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => $("#add-pedal option").length > 100 && $("#add-pedalboard option").length > 10);
  return p;
}

async function groupSelection(b) {
  console.log("\n# Group selection");
  const p = await freshPage(b);
  const C = await p.evaluate(() => { const r = $(".canvas")[0].getBoundingClientRect(); return { x: r.left + $(".canvas")[0].clientLeft, y: r.top + $(".canvas")[0].clientTop }; });
  // Add a pedalboard and 4 pedals, positioned explicitly
  const layout = await p.evaluate(() => {
    function add(sel, idx) { $(sel + " option").eq(idx).prop("selected", true); $(sel + " button").click(); return $(".canvas .item").last(); }
    const board = add("#add-pedalboard", 5).css({ left: 50, top: 400 });
    const pos = [[100, 100], [300, 120], [500, 100], [900, 600]];
    const pedals = pos.map((xy, i) => add("#add-pedal", 20 + i).css({ left: xy[0], top: xy[1] }));
    readyCanvas();
    $("body").click();
    return { board: board.attr("id"), pedals: pedals.map(x => x.attr("id")), n: $(".canvas .item").length,
      sizes: pedals.map(x => [x[0].offsetWidth, x[0].offsetHeight]) };
  });
  ok(layout.n === 5 && layout.sizes.every(s => s[0] > 0 && s[1] > 0), "setup: 1 board + 4 pedals with size", layout);
  const [A, B, Cc, D] = layout.pedals;
  const st = () => p.evaluate((ids) => ({
    sel: $(".canvas .selected").map(function () { return this.id; }).get(),
    panel: $(".panel:not(.settings-popover)").length ? $(".panel:not(.settings-popover) .panel__name").text().trim() : null,
    panelLinks: $(".panel:not(.settings-popover) a").map(function () { return $(this).attr("href"); }).get(),
    pos: Object.fromEntries(ids.map(id => [id, $("#" + id).length ? [parseFloat($("#" + id).css("left")), parseFloat($("#" + id).css("top")), ($("#" + id).attr("class").match(/rotate-\d+/) || [""])[0]] : null])),
    marquee: $(".marquee").length,
  }), [layout.board, ...layout.pedals]);
  const center = (id) => p.evaluate((id) => { const r = $("#" + id)[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const drag = async (x1, y1, x2, y2, mods = []) => { for (const m of mods) await p.keyboard.down(m); await p.mouse.move(x1, y1); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x1 + (x2 - x1) * i / 10, y1 + (y2 - y1) * i / 10); await p.mouse.up(); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(50); };
  // mouse.click ignores modifiers, so hold them on the keyboard
  const click = async (id, mods = []) => { const c = await center(id); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(c.x, c.y); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(50); };
  // Rectangle from empty space around the given items
  const lasso = async (ids) => { const u = await p.evaluate((ids) => { const rs = ids.map(id => $("#" + id)[0].getBoundingClientRect()); return { l: Math.min(...rs.map(r => r.left)) - 15, t: Math.min(...rs.map(r => r.top)) - 15, r: Math.max(...rs.map(r => r.right)) + 15, b: Math.max(...rs.map(r => r.bottom)) + 15 }; }, ids); await drag(u.l, u.t, u.r, u.b); };

  // 1. Rectangle on empty canvas over A, B and part of C; the board below is not touched
  await drag(C.x + 80, C.y + 60, C.x + 520, C.y + 130);
  let s = await st(), s0;
  ok(s.sel.length === 3 && [A, B, Cc].every(i => s.sel.includes(i)), "1 rectangle selects A, B, C (partial overlap counts)", s.sel);
  ok(s.panel === "3 items selected" && s.panelLinks.join() === "#rotate,#delete", "1 panel shows count with Rotate/Delete", [s.panel, s.panelLinks]);
  ok(s.marquee === 0, "1 marquee element removed");
  await drag(C.x + 60, C.y + 395, C.x + 80, C.y + 420, ["Shift"]);
  s = await st(); ok(s.sel.join() === layout.board, "1 rectangle picks up pedalboards", s.sel);

  // 2. Shift+drag starting on the board draws a rectangle and does not move the board
  const b0 = (await st()).pos[layout.board];
  const bc = await center(layout.board);
  await drag(bc.x, bc.y, C.x + 950, C.y + 650, ["Shift"]);
  s = await st();
  ok(JSON.stringify(s.pos[layout.board]) === JSON.stringify(b0), "2 Shift+drag on board does not move board", [b0, s.pos[layout.board]]);
  ok(s.sel.includes(D) && s.sel.includes(layout.board), "2 Shift+drag from board selects the board and pedal D", s.sel);
  // Dragging the selected board moves the selected pedal with it
  s0 = s; await drag(bc.x, bc.y, bc.x + 30, bc.y - 40); s = await st();
  ok([layout.board, D].every(i => s.pos[i][0] - s0.pos[i][0] === 30 && s.pos[i][1] - s0.pos[i][1] === -40) && JSON.stringify(s.pos[A]) === JSON.stringify(s0.pos[A]), "2 dragging the selected board moves the selected pedal too", [s0.pos, s.pos]);
  await drag(bc.x + 30, bc.y - 40, bc.x, bc.y); s = await st();
  ok(JSON.stringify(s.pos[layout.board]) === JSON.stringify(b0), "2 (board dragged back)", [b0, s.pos[layout.board]]);

  // 3. Click, Ctrl-click, empty-canvas click
  await click(A); s = await st(); ok(s.sel.join() === A && s.panelLinks.length === 4, "3 plain click selects single item with full panel", s);
  await click(B, ["Control"]); s = await st(); ok(s.sel.length === 2 && s.panel === "2 items selected", "3 Ctrl-click adds", s.sel);
  await click(A, ["Control"]); s = await st(); ok(s.sel.join() === B, "3 Ctrl-click removes", s.sel);
  await click(layout.board, ["Control"]); s = await st(); ok(s.sel.includes(layout.board) && s.sel.length === 2, "3 Ctrl-click adds pedalboard", s.sel);
  await click(Cc); s = await st(); ok(s.sel.join() === Cc, "3 plain click returns to single selection", s.sel);
  await p.mouse.click(C.x + 1200, C.y + 300); await p.waitForTimeout(50); s = await st(); ok(s.sel.length === 0 && s.panel === null, "3 click on empty canvas clears selection", s);

  // 4. Group drag
  await drag(C.x + 80, C.y + 60, C.x + 520, C.y + 130);
  s0 = await st();
  const ca = await center(A);
  await drag(ca.x, ca.y, ca.x + 40, ca.y + 100);
  s = await st();
  const moved = [A, B, Cc].map(i => [s.pos[i][0] - s0.pos[i][0], s.pos[i][1] - s0.pos[i][1]]);
  ok(moved.every(m => Math.abs(m[0] - 40) < 2 && Math.abs(m[1] - 100) < 2) && s.pos[D][0] === s0.pos[D][0], "4 group drag moves A, B, C by (40, 100), not D", moved);
  ok(s.sel.length === 3, "4 selection kept after group drag", s.sel);
  s0 = s; const cd = await center(D); await drag(cd.x, cd.y, cd.x - 50, cd.y - 50); s = await st();
  ok([A, B, Cc].every(i => JSON.stringify(s.pos[i]) === JSON.stringify(s0.pos[i])) && s.pos[D][0] !== s0.pos[D][0], "4 dragging unselected pedal moves only it");
  await lasso([A, B, Cc]); s0 = await st();
  ok(s0.sel.length === 3, "4 (reselect A, B, C)", s0.sel);
  const cb = await center(B); await drag(cb.x, cb.y, cb.x - 600, cb.y - 600);
  s = await st();
  const inside = await p.evaluate(() => unionRect(selectedItems()));
  const spacing0 = [s0.pos[B][0] - s0.pos[A][0], s0.pos[Cc][0] - s0.pos[A][0], s0.pos[B][1] - s0.pos[A][1]];
  const spacing1 = [s.pos[B][0] - s.pos[A][0], s.pos[Cc][0] - s.pos[A][0], s.pos[B][1] - s.pos[A][1]];
  ok(inside.left >= -0.5 && inside.top >= -0.5, "4 group dragged past edge stays inside canvas", inside);
  ok(spacing0.every((v, i) => Math.abs(v - spacing1[i]) < 1), "4 group keeps spacing at edge", [spacing0, spacing1]);
  const cb2 = await center(B); await drag(cb2.x, cb2.y, cb2.x + 300, cb2.y + 200);
  await lasso([A, B, Cc]);

  // 5. Group rotate
  s0 = await st();
  const geo = () => p.evaluate((ids) => ids.map(id => { const r = $("#" + id + " .artwork")[0].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; }), [A, B, Cc]);
  const g0 = await geo();
  // Wait out the 0.4s CSS rotate transition before measuring
  await p.keyboard.press("r"); await p.waitForTimeout(600); s = await st(); const g1 = await geo();
  ok([A, B, Cc].every(i => s.pos[i][2] === "rotate-90"), "5 R rotates each item to rotate-90", [A, B, Cc].map(i => s.pos[i][2]));
  const G = [(Math.min(...g0.map(r => r[0] - r[2] / 2)) + Math.max(...g0.map(r => r[0] + r[2] / 2))) / 2, (Math.min(...g0.map(r => r[1] - r[3] / 2)) + Math.max(...g0.map(r => r[1] + r[3] / 2))) / 2];
  const expected = g0.map(r => [G[0] - (r[1] - G[1]), G[1] + (r[0] - G[0])]);
  const errRot = g1.map((r, i) => Math.hypot(r[0] - expected[i][0], r[1] - expected[i][1]));
  ok(errRot.every(e => e < 2), "5 on-screen arrangement turns 90° clockwise around group centre", { errRot, g0, g1 });
  ok(g1.every((r, i) => Math.abs(r[2] - g0[i][3]) < 1 && Math.abs(r[3] - g0[i][2]) < 1), "5 each artwork visually rotated (w/h swapped)", { g0, g1 });
  for (let i = 0; i < 3; i++) await p.keyboard.press("r");
  s = await st();
  const drift = [A, B, Cc].map(i => [s.pos[i][0] - s0.pos[i][0], s.pos[i][1] - s0.pos[i][1], s.pos[i][2]]);
  ok(drift.every(d => Math.abs(d[0]) <= 1 && Math.abs(d[1]) <= 1 && d[2] === ""), "5 R x4 returns to start", drift);
  ok(s.sel.length === 3, "5 selection kept after R");
  await p.click('.panel a[href="#rotate"]'); s = await st();
  ok([A, B, Cc].every(i => s.pos[i][2] === "rotate-90") && s.sel.length === 3, "5 panel Rotate rotates the group, keeps selection", s.sel);
  await p.evaluate((id) => $("#" + id + " .actions").css({ opacity: 1 }), A);
  const rIcon = await p.evaluate((id) => { const r = $("#" + id + " .rotate")[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, A);
  await p.mouse.click(rIcon.x, rIcon.y); await p.waitForTimeout(50); s = await st();
  ok([A, B, Cc].every(i => s.pos[i][2] === "rotate-180") && s.sel.length === 3, "5 rotate icon on selected item rotates group", { sel: s.sel, rot: [A, B, Cc].map(i => s.pos[i][2]) });

  // 7. Arrow keys
  s0 = await st(); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowDown"); s = await st();
  const nud = [A, B, Cc].map(i => [s.pos[i][0] - s0.pos[i][0], s.pos[i][1] - s0.pos[i][1]]);
  ok(nud.every(n => n[0] === 1 && n[1] === 1), "7 arrows nudge each selected item by 1px, no stacking", nud);

  // 8. Persistence
  ok(!(await p.evaluate(() => localStorage.pedalCanvas)).includes("marquee"), "8 no .marquee in saved canvas");
  s0 = await st();
  await p.reload(); await p.waitForTimeout(1500);
  s = await st();
  ok([A, B, Cc, D].every(i => s.pos[i] && JSON.stringify(s.pos[i]) === JSON.stringify(s0.pos[i])), "8 positions and rotations restored after reload", { before: s0.pos, after: s.pos });

  // 6. Delete via D key, panel link and icon
  await drag(C.x + 1, C.y + 1, C.x + 1300, C.y + 380); s = await st();
  const sel6 = s.sel.slice();
  ok(sel6.length >= 2, "6 (selected group for D)", sel6);
  await p.keyboard.press("d"); s = await st();
  ok(sel6.every(i => !s.pos[i]), "6 D key deletes whole selection", s.pos);
  ok(s.panel === null, "6 panel removed after D delete", s.panel);
  const ids = await p.evaluate(() => { const r = []; for (let k = 0; k < 4; k++) { $("#add-pedal option").eq(40 + k).prop("selected", true); $("#add-pedal button").click(); const it = $(".canvas .item").last(); it.css({ left: 100 + k * 200, top: 100 }); r.push(it.attr("id")); } $("body").click(); return r; });
  await lasso([ids[0], ids[1]]); s = await st(); ok(s.sel.length === 2, "6 (selected 2 for panel delete)", s.sel);
  await p.click('.panel a[href="#delete"]');
  let left = await p.evaluate((ids) => ids.map(i => $("#" + i).length), ids);
  ok(left.join() === "0,0,1,1", "6 panel Delete removes whole selection", left);
  await lasso([ids[2], ids[3]]);
  await p.evaluate((id) => $("#" + id + " .actions").css({ opacity: 1 }), ids[2]);
  const dI = await p.evaluate((id) => { const r = $("#" + id + " .delete")[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ids[2]);
  await p.mouse.click(dI.x, dI.y); await p.waitForTimeout(50);
  left = await p.evaluate((ids) => ids.map(i => $("#" + i).length), ids);
  ok(left.join() === "0,0,0,0", "6 delete icon on selected item removes whole selection", left);

  // Clicks must not delete the settings popover (it holds #canvas-scale)
  const pop = await p.evaluate(() => ({ popover: $(".settings-popover").length, scale: $("#canvas-scale").val(), selPanel: $(".panel:not(.settings-popover)").length, nan: $(".canvas .artwork[style*=NaN]").length }));
  ok(pop.popover === 1 && pop.scale && pop.nan === 0, "settings popover and #canvas-scale survive all clicks, no NaN-sized pedals", pop);
  ok(pop.selPanel === 0, "no stale selection panel after deletes", pop);
  ok(p.errs.length === 0, "no page errors", p.errs);
  await p.context().close();
}

async function customUnits(b) {
  console.log("\n# Custom pedal units");
  const p = await freshPage(b);
  const add = (form, w, h, mm) => p.evaluate(([form, w, h, mm]) => {
    $("#convert-units").prop("checked", mm);
    $(form + " .custom-name").val("T"); $(form + " .custom-width").val(w); $(form + " .custom-height").val(h);
    const n = $(".canvas .item").length; $(form + " .btn").first().click();
    const it = form.includes("board") ? $(".canvas .pedalboard--custom").last() : $(".canvas .pedal--custom").last();
    return { added: $(".canvas .item").length - n, dw: it.attr("data-width"), dh: it.attr("data-height") };
  }, [form, w, h, mm]);
  let r = await add("#add-custom-pedal", 3, 5, false); ok(r.added === 1 && +r.dw === 3 && +r.dh === 5, "custom pedal 3x5 in, inches mode", r);
  r = await add("#add-custom-pedal", 76.2, 127, true); ok(r.added === 1 && Math.abs(r.dw - 3) < 0.02 && Math.abs(r.dh - 5) < 0.02, "custom pedal 76.2x127 mm becomes 3x5 in", r);
  r = await add("#add-custom-pedalboard", 24, 12, false); ok(r.added === 1 && +r.dw === 24 && +r.dh === 12, "custom board 24x12 in, inches mode", r);
  r = await add("#add-custom-pedalboard", 609.6, 304.8, true); ok(r.added === 1 && Math.abs(r.dw - 24) < 0.02 && Math.abs(r.dh - 12) < 0.02, "custom board 609.6x304.8 mm becomes 24x12 in", r);
  ok(p.errs.length === 0, "no page errors", p.errs);
  await p.context().close();
}

async function settingsMenu(b) {
  console.log("\n# Settings menu");
  const p = await freshPage(b);
  const vis = () => p.evaluate(() => ({ hidden: $(".settings-popover").hasClass("hide"), shown: $(".settings-popover").is(":visible"), open: $(".settings-trigger").hasClass("open") }));
  let v = await vis(); ok(v.hidden && !v.shown, "menu hidden on load", v);
  await p.click("header nav .settings-trigger"); await p.waitForTimeout(300); v = await vis();
  ok(!v.hidden && v.shown && v.open, "clicking nav settings icon opens menu", v);
  ok(p.url() === BASE_URL && p.context().pages().length === 1, "no navigation or new tab", [p.url(), p.context().pages().length]);
  await p.click("#convert-units"); await p.click("#canvas-scale"); v = await vis();
  ok(!v.hidden && v.shown, "clicking controls inside menu keeps it open", v);
  await p.click("header nav .settings-trigger"); await p.waitForTimeout(300); v = await vis();
  ok(v.hidden && !v.open, "clicking icon again closes menu", v);
  await p.click("header nav .settings-trigger"); await p.mouse.click(1200, 500); await p.waitForTimeout(300); v = await vis();
  ok(v.hidden && !v.open, "clicking empty canvas closes menu", v);
  await p.evaluate(() => { $("#add-pedal option").eq(20).prop("selected", true); $("#add-pedal button").click(); $(".canvas .item").last().css({ left: 400, top: 300 }); });
  await p.click("header nav .settings-trigger"); await p.waitForTimeout(300);
  const c = await p.evaluate(() => { const r = $(".canvas .pedal").last()[0].getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await p.mouse.click(c.x, c.y); await p.waitForTimeout(100);
  const s = await p.evaluate(() => ({ sel: $(".canvas .selected").length, n: $(".settings-popover").length }));
  ok(s.sel === 1 && s.n === 1, "selecting a pedal with menu open works, menu not deleted", s);
  ok(p.errs.length === 0, "no page errors", p.errs);
  await p.context().close();
}

async function unitsSwitch(b) {
  console.log("\n# Units switch");
  const p = await freshPage(b);
  const labels = () => p.evaluate(() => ({
    units: $("label .units").map(function () { return $(this).text(); }).get(),
    ph: ["#custom-pb-width", "#custom-pb-height", "#custom-p-width", "#custom-p-height"].map(s => $(s).attr("placeholder")),
    panel: $(".panel:not(.settings-popover) .panel__dimensions").text(),
  }));
  let l = await labels();
  ok(l.units.length === 4 && l.units.every(u => u === "(inches)"), "sidebar labels show inches on load", l);
  await p.evaluate(() => { $("#add-custom-pedal .custom-name").val("U"); $("#add-custom-pedal .custom-width").val(3); $("#add-custom-pedal .custom-height").val(5); $("#add-custom-pedal .btn").first().click(); $(".canvas .item").last().css({ left: 400, top: 300 }); $("body").click(); });
  const c = await p.evaluate(() => { const r = $(".canvas .pedal--custom").last()[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(c.x, c.y); l = await labels();
  ok(l.panel === "(3in x 5in)", "panel shows dimensions in inches", l.panel);
  await p.click("header nav .settings-trigger"); await p.click("#convert-units"); l = await labels();
  ok(l.units.every(u => u === "(mm)") && l.ph.join() === "610,318,70,108", "checking 'Use mm' switches sidebar labels and placeholders to mm", l);
  ok(l.panel === "(76mm x 127mm)", "checking 'Use mm' switches panel dimensions to mm", l.panel);
  await p.click("#convert-units"); l = await labels();
  ok(l.units.every(u => u === "(inches)") && l.ph.join() === "24,12.5,2.75,4.25", "unchecking switches sidebar back to inches", l);
  ok(p.errs.length === 0, "no page errors", p.errs);
  await p.context().close();
}

async function saveLoad(b) {
  console.log("\n# Save and load");
  const p = await freshPage(b);
  const ids = await p.evaluate(() => {
    $("#add-pedalboard option").eq(5).prop("selected", true); $("#add-pedalboard button").click(); $(".canvas .item").last().css({ left: 50, top: 400 });
    $("#add-pedal option").eq(20).prop("selected", true); $("#add-pedal button").click(); $(".canvas .item").last().css({ left: 300, top: 120 }).addClass("rotate-90");
    $("#canvas-scale").val(30).change();
    return $(".canvas .item").map(function () { return this.id; }).get();
  });
  const state = () => p.evaluate(() => ({
    items: $(".canvas .item").map(function () { return [this.id, $(this).css("left"), $(this).css("top"), ($(this).attr("class").match(/rotate-\d+/) || [""])[0]].join(" "); }).get(),
    scale: $("#canvas-scale").val(),
  }));
  const before = await state();
  await p.click("header nav .settings-trigger");
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 3000 }), p.click("#save-canvas")]).catch(e => [null]);
  ok(dl !== null, "Save to File starts a download");
  if (!dl) { await p.context().close(); return; }
  const file = await dl.path();
  const json = JSON.parse(require("fs").readFileSync(file, "utf8"));
  ok(/^Pedal Playground - .*\.json$/.test(dl.suggestedFilename()), "download named 'Pedal Playground - <date>.json'", dl.suggestedFilename());
  ok(json.source === "pedalplayground.com" && ids.every(i => json.canvas.includes(i)), "saved file holds the canvas with both items", Object.keys(json));

  // Empty everything, then load the file back
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => $("#add-pedal option").length > 100);
  ok((await state()).items.length === 0, "(canvas empty before load)");
  await p.click("header nav .settings-trigger");
  const [fc] = await Promise.all([p.waitForEvent("filechooser", { timeout: 3000 }), p.click("#load-canvas")]).catch(e => [null]);
  ok(fc !== null, "Load from File opens a file chooser");
  if (!fc) { await p.context().close(); return; }
  await fc.setFiles(file);
  await p.waitForFunction((n) => $(".canvas .item").length === n, ids.length, { timeout: 3000 }).catch(() => {});
  let after = await state();
  ok(JSON.stringify(after) === JSON.stringify(before), "loaded canvas matches saved items, positions, rotation and scale", { before, after });
  ok((await p.evaluate((ids) => ids.every(i => localStorage.pedalCanvas.includes(i)), ids)), "loaded canvas saved to localStorage");
  const it = await p.evaluate((id) => { const r = $("#" + id)[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ids[1]);
  await p.mouse.move(it.x, it.y); await p.mouse.down(); for (let i = 1; i <= 5; i++) await p.mouse.move(it.x + 10 * i, it.y); await p.mouse.up(); await p.waitForTimeout(50);
  after = await state();
  ok(after.items[1] !== before.items[1], "loaded items are draggable", after.items[1]);
  await p.reload(); await p.waitForTimeout(1000);
  ok(JSON.stringify(await state()) === JSON.stringify(after), "loaded canvas survives reload");
  ok(p.errs.length === 0, "no page errors", p.errs);
  await p.context().close();
}

(async () => {
  const b = await chromium.launch();
  try {
    await groupSelection(b);
    await customUnits(b);
    await settingsMenu(b);
    await unitsSwitch(b);
    await saveLoad(b);
  } finally {
    await b.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
