const _meta = {
  sourceVersion: 2,
  version: 1,
  runtime: "rhino",
  targets: ["backend"],
  effects: ["state"],
  icon: "mdi:timer-sand",
  tags: ["rate", "security", "quota"],
  summary: "rate {{operation}} {{bucket}}",
  description: "Checks, records or resets a server-local fixed-window rate limit. Example: call peek before password.verify, hit after a failed login, and reset after success; use request.clientAddress for an address quota. Never reads raw forwarding headers. A refusal is returned as data, not thrown.",
  longDescription: "Counters are shared by Flows on one Convertigo server instance, not across instances. Each bucket has its own table of at most maxEntries keys (default 10000); new keys fail closed when it is full. Backoff starts at one second when the limit is reached, doubles for each further hit and is capped by maxDelaySeconds. A hit reports whether that event was allowed before counting it. A blocked hit still counts for an existing key, so callers should use peek before expensive work. With backoff, the next event is permitted when its delay expires, even while events remain in the fixed window. Without backoff, the quota renews at the fixed window boundary. Empty bucket/key or invalid options fail closed with allowed=false and no exception.",
  properties: {
    operation: { label: "Operation", kind: "value", type: "string", enum: ["peek", "hit", "reset"], default: "peek", description: "peek does not count; hit counts one event; reset clears this key." },
    bucket: { label: "Bucket", kind: "template", type: "string", default: "", description: "Namespace for independent limits, for example login.user or signup.address." },
    key: { label: "Key", kind: "template", type: "string", default: "", description: "Normalized identifier or request.clientAddress. Never use a raw X-Forwarded-For header." },
    limit: { label: "Limit", kind: "value", type: "integer", default: 5, description: "Allowed events in one fixed window; positive integer." },
    windowSeconds: { label: "Window (seconds)", kind: "value", type: "integer", default: 900, description: "Fixed window length in seconds; positive integer." },
    backoff: { label: "Progressive backoff", kind: "value", type: "boolean", default: false, description: "If true, retry delay starts at one second and doubles after each further hit." },
    maxDelaySeconds: { label: "Maximum delay (seconds)", kind: "value", type: "integer", default: 900, description: "Maximum progressive retry delay; positive integer." },
    maxEntries: { label: "Maximum keys", kind: "value", type: "integer", default: 10000, description: "Capacity of this bucket; from 1 to 100000. New keys fail closed when full." }
  },
  outputs: { out: { type: "object", properties: {
    allowed: { type: "boolean" }, retryAfterSeconds: { type: "integer" }, count: { type: "integer" }
  } } }
};

(function () {
	var LinkedHashMap = typeof flowEngineClass === "function" ? flowEngineClass("java.util.LinkedHashMap") : Packages.java.util.LinkedHashMap;
	var HashMap = typeof flowEngineClass === "function" ? flowEngineClass("java.util.HashMap") : Packages.java.util.HashMap;
	var AtomicLongArray = typeof flowEngineClass === "function" ? flowEngineClass("java.util.concurrent.atomic.AtomicLongArray") : Packages.java.util.concurrent.atomic.AtomicLongArray;
	var Synchronizer = typeof flowEngineClass === "function" ? flowEngineClass("org.mozilla.javascript.Synchronizer") : Packages.org.mozilla.javascript.Synchronizer;
	var Engine = typeof flowEngineClass === "function" ? flowEngineClass("com.twinsoft.convertigo.engine.Engine") : Packages.com.twinsoft.convertigo.engine.Engine;
	var localTable = new LinkedHashMap();
	var sharedTable = null;

	function table() {
		if (sharedTable) return sharedTable;
		var app = Engine.theApp;
		var shared = app ? app.getShareServerMap() : null;
		if (!shared) return localTable;
		sharedTable = new Synchronizer(function () {
			var found = shared.get("flow.rate.check.v2");
			if (found == null) {
				found = new LinkedHashMap();
				shared.set("flow.rate.check.v2", found);
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

	function status(state, now, limit, backoff, maxDelay) {
		var count = Number(state.get(1));
		if (count < limit) return { allowed: true, retryAfterSeconds: 0, count: count };
		var remaining;
		if (backoff) {
			var delay = Math.min(maxDelay, Math.pow(2, Math.min(30, count - limit)));
			remaining = Number(state.get(2)) + delay * 1000 - now;
		} else {
			remaining = Number(state.get(0)) - now;
		}
		return { allowed: remaining <= 0, retryAfterSeconds: Math.max(0, Math.ceil(remaining / 1000)), count: count };
	}

	function space(bucketState, now) {
		var earliest = Number(bucketState.get("earliestExpiry"));
		if (earliest > now) return earliest;
		earliest = Infinity;
		var iterator = bucketState.get("entries").entrySet().iterator();
		while (iterator.hasNext()) {
			var entry = iterator.next(), expiry = Number(entry.getValue().get(0));
			if (expiry <= now) iterator.remove();
			else earliest = Math.min(earliest, expiry);
		}
		bucketState.put("earliestExpiry", earliest);
		return earliest;
	}

	function bucketSpace(store, now) {
		var earliest = Infinity, iterator = store.entrySet().iterator();
		while (iterator.hasNext()) {
			var bucket = iterator.next().getValue();
			earliest = Math.min(earliest, space(bucket, now));
			if (bucket.get("entries").isEmpty()) iterator.remove();
		}
		return earliest;
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
			if (!bucket || bucket.length > 128 || !key || key.length > 512 || !limit || !window || !maxDelay || !maxEntries ||
				(operation !== "peek" && operation !== "hit" && operation !== "reset")) {
				return { allowed: false, retryAfterSeconds: 0, count: 0 };
			}
			var store = table();
			return new Synchronizer(function () {
				var bucketState = store.get(bucket);
				if (operation === "reset") {
					if (bucketState != null) {
						var resetEntries = bucketState.get("entries");
						resetEntries.remove(key);
						if (resetEntries.isEmpty()) store.remove(bucket);
					}
					return { allowed: true, retryAfterSeconds: 0, count: 0 };
				}
				var now = Date.now();
				if (bucketState == null) {
					if (store.size() >= 1024) {
						var nextBucketExpiry = bucketSpace(store, now);
						if (store.size() >= 1024) return {
							allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((nextBucketExpiry - now) / 1000)), count: 0
						};
					}
					if (operation === "peek") return { allowed: true, retryAfterSeconds: 0, count: 0 };
					bucketState = new HashMap();
					bucketState.put("capacity", maxEntries);
					bucketState.put("entries", new LinkedHashMap());
					bucketState.put("earliestExpiry", Infinity);
					store.put(bucket, bucketState);
				}
				bucketState.put("capacity", Math.min(Number(bucketState.get("capacity")), maxEntries));
				var entries = bucketState.get("entries"), state = entries.get(key);
				if (state != null && Number(state.get(0)) <= now) {
					entries.remove(key);
					state = null;
				}
				if (state == null) {
					if (entries.isEmpty()) {
						bucketState.put("capacity", maxEntries);
						bucketState.put("earliestExpiry", Infinity);
					}
					if (entries.size() >= Number(bucketState.get("capacity"))) {
						var earliest = space(bucketState, now);
						if (entries.size() >= Number(bucketState.get("capacity"))) return {
							allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((earliest - now) / 1000)), count: 0
						};
					}
					if (operation === "peek") {
						if (entries.isEmpty()) store.remove(bucket);
						return { allowed: true, retryAfterSeconds: 0, count: 0 };
					}
					state = new AtomicLongArray(3);
					state.set(0, now + window);
					entries.put(key, state);
					bucketState.put("earliestExpiry", Math.min(Number(bucketState.get("earliestExpiry")), now + window));
				}
				var before = status(state, now, limit, backoff, maxDelay);
				if (operation === "peek") return before;
				if (Number(state.get(1)) < 9007199254740991) state.incrementAndGet(1);
				state.set(2, now);
				var after = status(state, now, limit, backoff, maxDelay);
				return { allowed: before.allowed, retryAfterSeconds: before.allowed ? 0 : after.retryAfterSeconds, count: after.count };
			}, store)();
		} catch (ignored) {
			return { allowed: false, retryAfterSeconds: 0, count: 0 };
		}
	}
	return { run: execute };
}())
