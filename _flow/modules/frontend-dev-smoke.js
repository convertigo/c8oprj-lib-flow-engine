(function () {
	// A bounded HTTP smoke check, never a substitute for the browser business paths. Routes requiring parameters
	// remain explicitly unverified. No cookie, bearer or automatic redirect is sent to another surface.
	// modules: paths from the root of the application, requested before the routes. A page answers 200 with its HTML
	// shell even when the browser then fails to load its modules, whereas Vite answers 500 for a module it fails to
	// transform. env.settleMs (with env.sleep) lets a module fail that long while Vite notices a change just made.
	// A module the dev server does not answer at all (connection refused or reset: Vite restarting after a regenerated
	// vite.config.ts) is not a transform failure: it is requested again for up to 8 s, then reported "unreachable".
	var UNREACHABLE_MS = 8000;
	// A route the dev server does not serve yet: SvelteKit adds a new +page.svelte to its routes when its file watcher
	// sees it, a moment after dev.sync wrote it, and answers 404 until then (cligate 26/11: /deals/ 404 one second after
	// its sync, 200 on the next dev.sync). Such a route, or one with no answer (Vite restarting), is requested again for
	// up to 8 s: dev.sync returns once the new route is served, and a route still 404 after that is a real failure.
	var ROUTE_SETTLE_MS = 8000;
	function check(routes, env, modules) {
		var started = env.now(), outcomes = [], failed = false, complete = true, moduleOutcomes = [];
		var budget = function () { return Math.min(2000, Math.max(1, 15000 - (env.now() - started))); };
		(modules || []).forEach(function (path) {
			var first = env.now(), settleUntil = first + Number(env.settleMs || 0), outcome;
			do {
				try {
					var response = env.probe(path, budget());
					var status = typeof response === "number" ? response : response.status;
					outcome = status >= 200 && status < 400 ? {module: path, httpStatus: status, status: "passed"}
						: {module: path, httpStatus: status, status: "failed", message: viteError(response) || "The dev server failed to transform this module."};
				} catch (error) {
					outcome = {module: path, status: "unreachable", message: String(error.message || error)};
				}
				if (outcome.status === "passed" || !env.sleep) break;
				if (outcome.status === "failed" && env.now() >= settleUntil) break;
				if (outcome.status === "unreachable" && env.now() - first >= UNREACHABLE_MS) break;
				env.sleep(outcome.status === "unreachable" ? 250 : 100);
			} while (env.now() - started < 15000);
			if (outcome.status !== "passed") failed = true;
			moduleOutcomes.push(outcome);
		});
		routes.forEach(function (route) {
			if (outcomes.length >= 50 || env.now() - started >= 15000 || /\[|\]/.test(route)) {
				complete = false;
				outcomes.push({route: route, status: "not_checked", message: "Supply a concrete route to the browser verifier."});
				return;
			}
			var first = env.now(), outcome, waiting, tries = 0;
			do {
				tries++;
				try {
					var response = env.probe(route, budget());
					var status = typeof response === "number" ? response : response.status;
					var overlay = /\[TSCONFIG_ERROR\]|vite-error-overlay/i.test(String(response.html || ""));
					var ok = status >= 200 && status < 400 && !overlay;
					outcome = {route: route, httpStatus: status, status: ok ? "passed" : "failed",
						message: overlay ? "Vite served an error overlay." : undefined};
					waiting = status === 404;
				} catch (error) {
					outcome = {route: route, status: "failed", message: String(error.message || error)};
					waiting = true;
				}
				if (outcome.status === "passed" || !waiting || !env.sleep || env.now() - first >= ROUTE_SETTLE_MS
					|| env.now() - started >= 15000) break;
				env.sleep(150);
			} while (true);
			if (tries > 1) outcome[outcome.status === "passed" ? "servedAfterMs" : "waitedMs"] = env.now() - first;
			if (outcome.status !== "passed") failed = true;
			outcomes.push(outcome);
		});
		var result = {ok: !failed, complete: complete, kind: "http", runtimeVerified: false, routes: outcomes,
			logTail: failed ? env.logTail() : "",
			next: "Use the browser verifier for client rendering, authenticated and business paths."};
		if (modules) result.modules = moduleOutcomes;
		return result;
	}
	// The message of the error page of Vite (const error = {"message": ...}), on one line
	function viteError(response) {
		var match = /"message":("(?:[^"\\]|\\.)*")/.exec(String(response && response.html || ""));
		if (!match) return "";
		try {
			return String(JSON.parse(match[1])).replace(/\s+/g, " ").trim().substring(0, 300);
		} catch (e) {
			return "";
		}
	}
	return {check: check};
}())
