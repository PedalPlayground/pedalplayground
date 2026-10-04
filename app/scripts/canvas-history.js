(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.PedalPlaygroundCanvas = factory();
	}
})(typeof window !== "undefined" ? window : this, function () {
	"use strict";

	function createHistory(options) {
		options = options || {};
		var limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
		var restore = typeof options.restore === "function" ? options.restore : function () {};
		var onChange = typeof options.onChange === "function" ? options.onChange : function () {};
		var snapshots = [];
		var index = -1;

		function notify() {
			onChange({ canUndo: index > 0, canRedo: index >= 0 && index < snapshots.length - 1 });
		}

		function reset(snapshot) {
			snapshots = [snapshot];
			index = 0;
			notify();
		}

		function record(snapshot) {
			if (index < 0) {
				reset(snapshot);
				return true;
			}
			if (snapshots[index] === snapshot) {
				notify();
				return false;
			}
			snapshots = snapshots.slice(0, index + 1);
			snapshots.push(snapshot);
			if (snapshots.length > limit) snapshots.shift();
			index = snapshots.length - 1;
			notify();
			return true;
		}

		function moveTo(nextIndex) {
			if (nextIndex < 0 || nextIndex >= snapshots.length || nextIndex === index) return false;
			restore(snapshots[nextIndex]);
			index = nextIndex;
			notify();
			return true;
		}

		return {
			reset: reset,
			record: record,
			undo: function () { return moveTo(index - 1); },
			redo: function () { return moveTo(index + 1); },
			canUndo: function () { return index > 0; },
			canRedo: function () { return index >= 0 && index < snapshots.length - 1; },
			getIndex: function () { return index; },
			getLength: function () { return snapshots.length; },
			getCurrent: function () { return index < 0 ? undefined : snapshots[index]; },
		};
	}

	function resolveShortcut(event, isEditable) {
		if (isEditable) return null;
		var key = event.which || event.keyCode;
		if (!key && event.key) key = String(event.key).toUpperCase().charCodeAt(0);
		var hasModifier = event.metaKey || event.ctrlKey;

		if (hasModifier && (key === 90 || key === 89)) {
			return key === 89 || event.shiftKey ? "redo" : "undo";
		}
		if (hasModifier) return null;
		var actions = {
			8: "delete", 46: "delete", 68: "delete", 67: "clone", 82: "rotate",
			219: "sendBackward", 221: "bringForward",
			37: "left", 38: "up", 39: "right", 40: "down",
		};
		return actions[key] || null;
	}

	function getClonePosition(left, top, offset) {
		left = parseFloat(left);
		top = parseFloat(top);
		offset = Number.isFinite(offset) ? offset : 20;
		return {
			left: (Number.isFinite(left) ? left : 0) + offset,
			top: (Number.isFinite(top) ? top : 0) + offset,
		};
	}

	return {
		createHistory: createHistory,
		resolveShortcut: resolveShortcut,
		getClonePosition: getClonePosition,
	};
});
