(function () {
	// A bounded HTTP smoke check, never a substitute for the browser business paths. Routes requiring parameters
	// remain explicitly unverified. No cookie, bearer or automatic redirect is sent to another surface.
	// modules: paths from the root of the application, requested before the routes. A page answers 200 with its HTML
	// shell even when the browser then fails to load its modules, whereas Vite answers 500 for a module it fails to
	// transform. env.settleMs (with env.sleep) lets a module fail that long while Vite notices a change just made.
	function check(routes, env, modules) {
		var started = env.now(), outcomes = [], failed = false, complete = true, moduleOutcomes = [];
		var budget = function () { return Math.min(2000, Math.max(1, 15000 - (env.now() - started))); };
		(modules || []).forEach(function (path) {
			var settleUntil = env.now() + Number(env.settleMs || 0), outcome;
			do {
				try {
					var response = env.probe(path, budget());
					var status = typeof response === "number" ? response : response.status;
					outcome = status >= 200 && status < 400 ? {module: path, httpStatus: status, status: "passed"}
						: {module: path, httpStatus: status, status: "failed", message: viteError(response) || "The dev server failed to transform this module."};
				} catch (error) {
					outcome = {module: path, status: "failed", message: String(error.message || error)};
				}
				if (outcome.status === "passed" || !env.sleep || env.now() >= settleUntil) break;
				env.sleep(100);
			} while (env.now() - started < 15000);
			if (outcome.status === "failed") failed = true;
			moduleOutcomes.push(outcome);
		});
		routes.forEach(function (route) {
			if (outcomes.length >= 50 || env.now() - started >= 15000 || /\[|\]/.test(route)) {
				complete = false;
				outcomes.push({route: route, status: "not_checked", message: "Supply a concrete route to the browser verifier."});
				return;
			}
			try {
				var response = env.probe(route, budget());
				var status = typeof response === "number" ? response : response.status;
				var overlay = /\[TSCONFIG_ERROR\]|vite-error-overlay/i.test(String(response.html || ""));
				var ok = status >= 200 && status < 400 && !overlay;
				outcomes.push({route: route, httpStatus: status, status: ok ? "passed" : "failed",
					message: overlay ? "Vite served an error overlay." : undefined});
				if (!ok) failed = true;
			} catch (error) {
				failed = true;
				outcomes.push({route: route, status: "failed", message: String(error.message || error)});
			}
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
