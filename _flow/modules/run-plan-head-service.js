(function () {
	function sourceFingerprint(request) {
		request = request || {};
		if (request.flowSource === undefined || request.flowSource === null || String(request.flowSource).trim() === "") {
			return "";
		}
		return String(request.flowSource);
	}

	function cacheKey(request, env) {
		request = request || {};
		var project = request.projectDir;
		if ((project === undefined || project === null || String(project) === "") && typeof env.projectDir === "function") {
			project = env.projectDir();
		}
		var name = request.flowQName || request.name || request.flowName || "Flow";
		return String(project || "") + "\n" + String(name);
	}

	function read(request, env) {
		var fingerprint = sourceFingerprint(request);
		var cache = env.cache;
		if (!fingerprint || !cache || !cache.entries) {
			return null;
		}
		var key = cacheKey(request, env);
		var entry = cache.entries[key];
		var now = typeof env.currentTimeMillis === "function" ? Number(env.currentTimeMillis()) : new Date().getTime();
		var interval = Math.max(0, Number(env.probeIntervalMs === undefined || env.probeIntervalMs === null
			? 60000
			: env.probeIntervalMs));
		if (entry && entry.fingerprint === fingerprint && entry.value &&
				now - Number(entry.value.checkedAt || 0) < interval) {
			cache.hits++;
			entry.usedAt = ++cache.clock;
			return entry.value;
		}
		cache.misses++;
		return null;
	}

	function write(request, blocks, plan, env) {
		var fingerprint = sourceFingerprint(request);
		if (!fingerprint || !blocks || !plan || !env.cache || typeof env.writeRuntimeBoundedCache !== "function") {
			return null;
		}
		var value = {
			blocks: blocks,
			plan: plan,
			checkedAt: typeof env.currentTimeMillis === "function" ? Number(env.currentTimeMillis()) : new Date().getTime()
		};
		return env.writeRuntimeBoundedCache(env.cache, cacheKey(request, env), fingerprint, value,
			"hot Flow run plans");
	}

	function clear(env) {
		if (env.cache && typeof env.clearRuntimeBoundedCache === "function") {
			env.clearRuntimeBoundedCache(env.cache);
		}
	}

	return {
		read: read,
		write: write,
		clear: clear,
		sourceFingerprint: sourceFingerprint,
		cacheKey: cacheKey
	};
}())
