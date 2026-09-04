(function () {
	"use strict";

	var FORMAT_VERSION = 1;
	var BUILD_REASONS = {
		manual: true,
		"no-viewer-timeout": true
	};

	function shouldBuild(reason) {
		return BUILD_REASONS[String(reason || "")] === true;
	}

	function shouldBuildOnStop(reason) {
		return /^(?:manual|no-viewer-timeout)$/.test(String(reason || ""));
	}

	function normalize(state) {
		state = state && typeof state === "object" ? state : {};
		return {
			version: FORMAT_VERSION,
			currentFingerprint: String(state.currentFingerprint || ""),
			builtFingerprint: String(state.builtFingerprint || ""),
			dirty: state.dirty === true,
			status: String(state.status || "idle"),
			reason: String(state.reason || ""),
			requestedAt: String(state.requestedAt || ""),
			startedAt: String(state.startedAt || ""),
			completedAt: String(state.completedAt || ""),
			failure: String(state.failure || ""),
			durationMs: Number(state.durationMs || 0)
		};
	}

	function observe(state, fingerprint) {
		var next = normalize(state);
		next.currentFingerprint = String(fingerprint || "");
		next.dirty = next.currentFingerprint !== "" &&
			next.currentFingerprint !== next.builtFingerprint;
		if (next.status !== "building") {
			next.status = next.dirty ? "dirty" : "current";
		}
		return next;
	}

	function requested(state, reason, now) {
		var next = normalize(state);
		next.status = "queued";
		next.reason = String(reason || "");
		next.requestedAt = String(now || "");
		next.failure = "";
		return next;
	}

	function started(state, now) {
		var next = normalize(state);
		next.status = "building";
		next.startedAt = String(now || "");
		next.failure = "";
		return next;
	}

	function completed(state, fingerprint, now, durationMs) {
		var next = normalize(state);
		next.currentFingerprint = String(fingerprint || next.currentFingerprint || "");
		next.builtFingerprint = next.currentFingerprint;
		next.dirty = false;
		next.status = "current";
		next.completedAt = String(now || "");
		next.durationMs = Number(durationMs || 0);
		next.failure = "";
		return next;
	}

	function failed(state, message, now, durationMs) {
		var next = normalize(state);
		next.dirty = true;
		next.status = "failed";
		next.completedAt = String(now || "");
		next.durationMs = Number(durationMs || 0);
		next.failure = String(message || "Production build failed.");
		return next;
	}

	return Object.freeze({
		FORMAT_VERSION: FORMAT_VERSION,
		shouldBuild: shouldBuild,
		shouldBuildOnStop: shouldBuildOnStop,
		normalize: normalize,
		observe: observe,
		requested: requested,
		started: started,
		completed: completed,
		failed: failed
	});
}())
