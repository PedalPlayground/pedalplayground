"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const canvas = require("../public/scripts/canvas-history.js");

test("history starts empty and records its first snapshot", () => {
	const history = canvas.createHistory();
	assert.equal(history.getIndex(), -1);
	assert.equal(history.getLength(), 0);
	assert.equal(history.getCurrent(), undefined);
	assert.equal(history.canUndo(), false);
	assert.equal(history.canRedo(), false);
	assert.equal(history.record("initial"), true);
	assert.equal(history.getCurrent(), "initial");
	assert.equal(history.getIndex(), 0);
	assert.equal(history.getLength(), 1);
	assert.equal(history.canUndo(), false);
});

test("undo and redo restore snapshots and stop at both ends", () => {
	const restored = [];
	const history = canvas.createHistory({ restore: (snapshot) => restored.push(snapshot) });
	history.record("one");
	history.record("two");
	history.record("three");

	assert.equal(history.canUndo(), true);
	assert.equal(history.undo(), true);
	assert.deepEqual(restored, ["two"]);
	assert.equal(history.getCurrent(), "two");
	assert.equal(history.canRedo(), true);
	assert.equal(history.undo(), true);
	assert.equal(history.undo(), false);
	assert.deepEqual(restored, ["two", "one"]);
	assert.equal(history.redo(), true);
	assert.equal(history.redo(), true);
	assert.equal(history.redo(), false);
	assert.deepEqual(restored, ["two", "one", "two", "three"]);
	assert.equal(history.getCurrent(), "three");
});

test("duplicate snapshots are ignored without changing the cursor", () => {
	const history = canvas.createHistory();
	history.record("same");
	assert.equal(history.record("same"), false);
	assert.equal(history.getLength(), 1);
	assert.equal(history.getIndex(), 0);
});

test("a new snapshot after undo removes the redo branch", () => {
	const history = canvas.createHistory();
	history.record("one");
	history.record("two");
	history.record("three");
	history.undo();
	assert.equal(history.canRedo(), true);

	history.record("replacement");
	assert.equal(history.getCurrent(), "replacement");
	assert.equal(history.getLength(), 3);
	assert.equal(history.canRedo(), false);
	assert.equal(history.undo(), true);
	assert.equal(history.getCurrent(), "two");
});

test("history remains bounded and keeps the newest snapshots", () => {
	const history = canvas.createHistory({ limit: 3 });
	["one", "two", "three", "four", "five"].forEach((snapshot) => history.record(snapshot));
	assert.equal(history.getLength(), 3);
	assert.equal(history.getIndex(), 2);
	assert.equal(history.getCurrent(), "five");
	assert.equal(history.undo(), true);
	assert.equal(history.getCurrent(), "four");
	assert.equal(history.undo(), true);
	assert.equal(history.getCurrent(), "three");
	assert.equal(history.undo(), false);
});

test("invalid history limits fall back to the default of fifty", () => {
	for (const limit of [0, -1, 1.5, NaN, "2"]) {
		const history = canvas.createHistory({ limit });
		for (let index = 0; index < 51; index += 1) history.record(String(index));
		assert.equal(history.getLength(), 50);
		assert.equal(history.getCurrent(), "50");
	}
});

test("reset replaces the stack and updates undo/redo availability", () => {
	const updates = [];
	const history = canvas.createHistory({ onChange: (state) => updates.push(state) });
	history.record("one");
	history.record("two");
	history.undo();
	history.reset("fresh");
	assert.equal(history.getLength(), 1);
	assert.equal(history.getCurrent(), "fresh");
	assert.equal(history.canUndo(), false);
	assert.equal(history.canRedo(), false);
	assert.deepEqual(updates.at(-1), { canUndo: false, canRedo: false });
});

test("failed restoration leaves the history cursor unchanged", () => {
	const history = canvas.createHistory({ restore: () => { throw new Error("restore failed"); } });
	history.record("one");
	history.record("two");
	assert.throws(() => history.undo(), /restore failed/);
	assert.equal(history.getIndex(), 1);
	assert.equal(history.getCurrent(), "two");
});

test("keyboard shortcut resolver maps history and canvas actions", () => {
	const cases = [
		[{ key: "z", ctrlKey: true }, "undo"],
		[{ which: 90, metaKey: true }, "undo"],
		[{ key: "z", ctrlKey: true, shiftKey: true }, "redo"],
		[{ keyCode: 89, metaKey: true }, "redo"],
		[{ key: "c" }, "clone"],
		[{ which: 68 }, "delete"],
		[{ keyCode: 8 }, "delete"],
		[{ keyCode: 46 }, "delete"],
		[{ key: "r" }, "rotate"],
		[{ keyCode: 219 }, "sendBackward"],
		[{ keyCode: 221 }, "bringForward"],
		[{ keyCode: 37 }, "left"],
		[{ keyCode: 38 }, "up"],
		[{ keyCode: 39 }, "right"],
		[{ keyCode: 40 }, "down"],
	];
	for (const [event, action] of cases) {
		assert.equal(canvas.resolveShortcut(event, false), action, JSON.stringify(event));
	}
});

test("keyboard resolver ignores editable fields and unrelated modified shortcuts", () => {
	assert.equal(canvas.resolveShortcut({ key: "c" }, true), null);
	assert.equal(canvas.resolveShortcut({ key: "a" }, false), null);
	assert.equal(canvas.resolveShortcut({ key: "c", ctrlKey: true }, false), null);
	assert.equal(canvas.resolveShortcut({ key: "z" }, false), null);
});

test("clone position parses CSS values and applies the default offset", () => {
	assert.deepEqual(canvas.getClonePosition("12px", "34.5px"), { left: 32, top: 54.5 });
	assert.deepEqual(canvas.getClonePosition("-8px", "0px"), { left: 12, top: 20 });
	assert.deepEqual(canvas.getClonePosition("auto", "invalid"), { left: 20, top: 20 });
	assert.deepEqual(canvas.getClonePosition("10px", "15px", 5), { left: 15, top: 20 });
});

test("browser and app copies of the module stay identical and load before app code", () => {
	const appModule = fs.readFileSync(path.join(root, "app/scripts/canvas-history.js"), "utf8");
	const publicModule = fs.readFileSync(path.join(root, "public/scripts/canvas-history.js"), "utf8");
	const pages = ["index.html", "list.html"].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
	assert.equal(appModule, publicModule);
	for (const html of pages) {
		assert.ok(html.indexOf("public/scripts/canvas-history.js") < html.indexOf("public/scripts/scripts.js"));
	}
	assert.match(fs.readFileSync(path.join(root, "gulpfile.js"), "utf8"), /app\/scripts\/canvas-history\.js/);
});

test("both app and served scripts delegate history, shortcuts, and clone offset to the module", () => {
	for (const file of ["app/scripts/scripts.js", "public/scripts/scripts.js"]) {
		const source = fs.readFileSync(path.join(root, file), "utf8");
		assert.match(source, /PedalPlaygroundCanvas\.createHistory/);
		assert.match(source, /PedalPlaygroundCanvas\.resolveShortcut/);
		assert.match(source, /PedalPlaygroundCanvas\.getClonePosition/);
		assert.doesNotMatch(source, /canvasHistoryIndex/);
	}
});
