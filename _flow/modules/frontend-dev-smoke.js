(function () {
	// A bounded HTTP smoke check, never a substitute for the browser business paths. Routes requiring parameters
	// remain explicitly unverified. No cookie, bearer or automatic redirect is sent to another surface.
	function check(routes, env) {
		var started = env.now(), outcomes = [], failed = false, complete = true;
		routes.forEach(function (route) {
			if (outcomes.length >= 50 || env.now() - started >= 15000 || /\[|\]/.test(route)) {
				complete = false;
				outcomes.push({route: route, status: "not_checked", message: "Supply a concrete route to the browser verifier."});
				return;
			}
			try {
				var status = env.probe(route, Math.min(2000, Math.max(1, 15000 - (env.now() - started))));
				var ok = status >= 200 && status < 400;
				outcomes.push({route: route, httpStatus: status, status: ok ? "passed" : "failed"});
				if (!ok) failed = true;
			} catch (error) {
				failed = true;
				outcomes.push({route: route, status: "failed", message: String(error.message || error)});
			}
		});
		return {ok: !failed, complete: complete, kind: "http", runtimeVerified: false, routes: outcomes,
			logTail: failed ? env.logTail() : "",
			next: "Use the browser verifier for client rendering, authenticated and business paths."};
	}
	return {check: check};
}())
