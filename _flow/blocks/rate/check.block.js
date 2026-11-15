const _meta = {
  sourceVersion: 2,
  version: 1,
  runtime: "rhino",
  targets: ["backend"],
  effects: ["state"],
  icon: "mdi:timer-sand",
  tags: ["rate", "security", "quota"],
  summary: "rate {{operation}} {{bucket}}",
  description: "Checks, records or resets a server-local sliding-window rate limit. Example: call peek before password.verify, hit after a failed login, and reset after success; use request.clientAddress for an address quota. Never reads raw forwarding headers. A refusal is returned as data, not thrown.",
  longDescription: "The table is shared by Flows on one Convertigo server instance, not across instances. A least-recently-used table holds at most maxEntries keys (default 10000); eviction or a server restart clears a key. Backoff starts at one second when the limit is reached, doubles for each further hit and is capped by maxDelaySeconds. A hit reports whether that event was allowed before counting it. A blocked hit still counts, so callers should use peek before expensive work. With backoff, the next event is permitted when its delay expires, even while events remain in the window. Without backoff, the quota renews as old events leave the window. Empty bucket/key or invalid options fail closed with allowed=false and no exception.",
  properties: {
    operation: { label: "Operation", kind: "value", type: "string", enum: ["peek", "hit", "reset"], default: "peek", description: "peek does not count; hit counts one event; reset clears this key." },
    bucket: { label: "Bucket", kind: "template", type: "string", default: "", description: "Namespace for independent limits, for example login.user or signup.address." },
    key: { label: "Key", kind: "template", type: "string", default: "", description: "Normalized identifier or request.clientAddress. Never use a raw X-Forwarded-For header." },
    limit: { label: "Limit", kind: "value", type: "integer", default: 5, description: "Allowed events in one sliding window; positive integer." },
    windowSeconds: { label: "Window (seconds)", kind: "value", type: "integer", default: 900, description: "Sliding window length in seconds; positive integer." },
    backoff: { label: "Progressive backoff", kind: "value", type: "boolean", default: false, description: "If true, retry delay starts at one second and doubles after each further hit." },
    maxDelaySeconds: { label: "Maximum delay (seconds)", kind: "value", type: "integer", default: 900, description: "Maximum progressive retry delay; positive integer." },
    maxEntries: { label: "Maximum keys", kind: "value", type: "integer", default: 10000, description: "LRU capacity shared by the server; from 1 to 100000." }
  },
  outputs: { out: { type: "object", properties: {
    allowed: { type: "boolean" }, retryAfterSeconds: { type: "integer" }, count: { type: "integer" }
  } } }
};

(function () {
	var LinkedHashMap = typeof flowEngineClass === "function" ? flowEngineClass("java.util.LinkedHashMap") : Packages.java.util.LinkedHashMap;
	var ArrayDeque = typeof flowEngineClass === "function" ? flowEngineClass("java.util.ArrayDeque") : Packages.java.util.ArrayDeque;
	var Synchronizer = typeof flowEngineClass === "function" ? flowEngineClass("org.mozilla.javascript.Synchronizer") : Packages.org.mozilla.javascript.Synchronizer;
	var Engine = typeof flowEngineClass === "function" ? flowEngineClass("com.twinsoft.convertigo.engine.Engine") : Packages.com.twinsoft.convertigo.engine.Engine;
	var localTable = new LinkedHashMap(16, 0.75, true);
	var sharedTable = null;

	function table() {
		if (sharedTable) return sharedTable;
		var app = Engine.theApp;
		var shared = app ? app.getShareServerMap() : null;
		if (!shared) return localTable;
		sharedTable = new Synchronizer(function () {
			var found = shared.get("flow.rate.check.v1");
			if (found == null) {
				found = new LinkedHashMap(16, 0.75, true);
				shared.set("flow.rate.check.v1", found);
			}
			return found;
		}, shared)();
		return sharedTable;
	}

	function positive(value, fallback, maximum) {
		if (value === undefined || value === null || value === "") value = fallback;
		value = Number(value);
		return isFinite(value) && Math.floor(value) === value && value > 0 && value <= maximum ? value : 0;
	}

	function status(events, now, limit, window, backoff, maxDelay) {
		while (!events.isEmpty() && Number(events.peekFirst()) <= now - window) events.removeFirst();
		var count = events.size();
		if (count < limit) return { allowed: true, retryAfterSeconds: 0, count: count };
		var remaining;
		if (backoff) {
			var delay = Math.min(maxDelay, Math.pow(2, Math.min(30, count - limit)));
			remaining = Number(events.peekLast()) + delay * 1000 - now;
		} else {
			remaining = Number(events.peekFirst()) + window - now;
		}
		return { allowed: remaining <= 0, retryAfterSeconds: Math.max(0, Math.ceil(remaining / 1000)), count: count };
	}

	function execute(ctx, node) {
		try {
			var p = ctx.props(node), operation = String(ctx.input({ value: p.operation === undefined ? "peek" : p.operation }));
			var bucket = String(ctx.template(p.bucket === undefined ? "" : p.bucket));
			var key = String(ctx.template(p.key === undefined ? "" : p.key));
			var limit = positive(ctx.input({ value: p.limit }), 5, 1000000);
			var window = positive(ctx.input({ value: p.windowSeconds }), 900, 86400) * 1000;
			var maxDelay = positive(ctx.input({ value: p.maxDelaySeconds }), 900, 86400);
			var maxEntries = positive(ctx.input({ value: p.maxEntries }), 10000, 100000);
			var backoff = ctx.input({ value: p.backoff === undefined ? false : p.backoff }) === true;
			if (!bucket || !key || !limit || !window || !maxDelay || !maxEntries ||
				(operation !== "peek" && operation !== "hit" && operation !== "reset")) {
				return { allowed: false, retryAfterSeconds: 0, count: 0 };
			}
			var id = bucket.length + ":" + bucket + key.length + ":" + key;
			var store = table();
			return new Synchronizer(function () {
				while (store.size() > maxEntries) store.remove(store.keySet().iterator().next());
				if (operation === "reset") {
					store.remove(id);
					return { allowed: true, retryAfterSeconds: 0, count: 0 };
				}
				var events = store.get(id), now = Date.now();
				if (events == null) {
					if (operation === "peek") return { allowed: true, retryAfterSeconds: 0, count: 0 };
					events = new ArrayDeque();
					store.put(id, events);
				}
				var before = status(events, now, limit, window, backoff, maxDelay);
				if (events.isEmpty() && operation === "peek") store.remove(id);
				if (operation === "peek") return before;
				events.addLast(now);
				while (store.size() > maxEntries) store.remove(store.keySet().iterator().next());
				var after = status(events, now, limit, window, backoff, maxDelay);
				return { allowed: before.allowed, retryAfterSeconds: before.allowed ? 0 : after.retryAfterSeconds, count: after.count };
			}, store)();
		} catch (ignored) {
			return { allowed: false, retryAfterSeconds: 0, count: 0 };
		}
	}
	return { run: execute };
}())
