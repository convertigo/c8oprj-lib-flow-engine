(function () {
	function concurrent(state, limit) {
		if (typeof __flowRuntimeApi !== "undefined") Object.defineProperty(state, "__shared", {
			value: __flowRuntimeApi.newCache(limit || 1024), enumerable: false
		});
		return state;
	}
	function createValueState() {
		return concurrent({
			key: "",
			value: null,
			hits: 0,
			misses: 0,
			clears: 0,
			updatedAt: "",
			label: ""
		}, 1024);
	}

	function createMapState() {
		return concurrent({
			entries: {},
			hits: 0,
			misses: 0,
			clears: 0,
			updatedAt: "",
			label: ""
		}, 1024);
	}

	function createBoundedMapState(limit) {
		return concurrent({
			entries: {},
			limit: Math.max(1, Number(limit || 1024)),
			size: 0,
			clock: 0,
			hits: 0,
			misses: 0,
			evictions: 0,
			clears: 0,
			updatedAt: "",
			label: ""
		}, limit);
	}

	function now() {
		return new Date().toISOString();
	}

	function readValue(cache, key) {
		if (cache.__shared) return cache.__shared.read(String(key), "");
		if (cache.value && cache.key === key) {
			cache.hits++;
			return cache.value;
		}
		cache.misses++;
		return null;
	}

	function writeValue(cache, key, value, label) {
		if (cache.__shared) return cache.__shared.write(String(key), "", value);
		cache.key = key;
		cache.value = value;
		cache.label = label || "";
		cache.updatedAt = now();
		return value;
	}

	function readMap(cache, key, fingerprint) {
		if (cache.__shared) return cache.__shared.read(String(key), fingerprint === undefined ? null : String(fingerprint));
		var entry = cache.entries[key];
		if (entry && entry.fingerprint === fingerprint) {
			cache.hits++;
			return entry.value;
		}
		cache.misses++;
		return null;
	}

	function writeMap(cache, key, fingerprint, value, label) {
		if (cache.__shared) return cache.__shared.write(String(key), String(fingerprint), value);
		cache.entries[key] = {
			fingerprint: fingerprint,
			value: value,
			updatedAt: now()
		};
		cache.label = label || "";
		cache.updatedAt = cache.entries[key].updatedAt;
		return value;
	}

	function evictOldest(cache) {
		var oldestKey = null;
		var oldestUsedAt = Number.MAX_VALUE;
		Object.keys(cache.entries || {}).forEach(function (key) {
			var entry = cache.entries[key] || {};
			var usedAt = Number(entry.usedAt || 0);
			if (oldestKey === null || usedAt < oldestUsedAt) {
				oldestKey = key;
				oldestUsedAt = usedAt;
			}
		});
		if (oldestKey !== null) {
			delete cache.entries[oldestKey];
			cache.size = Math.max(0, Number(cache.size || 0) - 1);
			cache.evictions++;
			return true;
		}
		return false;
	}

	function readBoundedMap(cache, key, fingerprint) {
		if (cache.__shared) return cache.__shared.read(String(key), fingerprint === undefined ? null : String(fingerprint));
		var entry = cache.entries[key];
		if (entry && (fingerprint === undefined || entry.fingerprint === fingerprint)) {
			cache.hits++;
			entry.usedAt = ++cache.clock;
			return entry.value;
		}
		cache.misses++;
		return null;
	}

	function writeBoundedMap(cache, key, fingerprint, value, label) {
		if (cache.__shared) return cache.__shared.write(String(key), String(fingerprint), value);
		var entry = cache.entries[key];
		if (!entry) {
			while (cache.size >= cache.limit) {
				if (!evictOldest(cache)) {
					break;
				}
			}
			cache.size++;
		}
		cache.entries[key] = {
			fingerprint: fingerprint,
			value: value,
			updatedAt: now(),
			usedAt: ++cache.clock
		};
		cache.label = label || "";
		cache.updatedAt = cache.entries[key].updatedAt;
		return value;
	}

	function clearValue(cache) {
		if (cache.__shared) cache.__shared.clear();
		cache.key = "";
		cache.value = null;
		cache.clears++;
		cache.updatedAt = now();
	}

	function clearMap(cache) {
		if (cache.__shared) cache.__shared.clear();
		cache.entries = {};
		cache.clears++;
		cache.updatedAt = now();
	}

	function clearBoundedMap(cache) {
		if (cache.__shared) cache.__shared.clear();
		cache.entries = {};
		cache.size = 0;
		cache.clock = 0;
		cache.clears++;
		cache.updatedAt = now();
	}

	function clearMapWhere(cache, predicate) {
		var removed = 0;
		if (cache.__shared && typeof predicate === "function") {
			var keys = cache.__shared.keys();
			for (var i = 0; i < keys.length; i++) {
				var key = String(keys[i]);
				if (predicate(key, {value: cache.__shared.read(key, null)}) && cache.__shared.remove(key)) removed++;
			}
			return removed;
		}
		if (!cache.entries || typeof predicate !== "function") {
			return removed;
		}
		Object.keys(cache.entries).forEach(function (key) {
			if (predicate(key, cache.entries[key])) {
				delete cache.entries[key];
				removed++;
			}
		});
		if (removed > 0) {
			if (cache.limit) {
				cache.size = Math.max(0, Number(cache.size || 0) - removed);
			}
			cache.clears++;
			cache.updatedAt = now();
		}
		return removed;
	}

	function summary(name, cache, includeEntries) {
		if (cache.__shared) return { name: name, warm: cache.__shared.size() > 0, entryCount: cache.__shared.size(), hits: cache.__shared.hits(), misses: cache.__shared.misses(), limit: cache.limit };
		var entries = cache.entries ? Object.keys(cache.entries).sort() : [];
		var out = {
			name: name,
			warm: cache.entries ? entries.length > 0 : !!cache.value,
			hits: cache.hits,
			misses: cache.misses,
			evictions: cache.evictions || undefined,
			clears: cache.clears,
			updatedAt: cache.updatedAt,
			label: cache.label,
			entryCount: entries.length || undefined,
			limit: cache.limit || undefined
		};
		if (includeEntries === true && entries.length) {
			out.entries = entries.slice(0, 20).map(function (key) {
				var entry = cache.entries[key] || {};
				return {
					key: key,
					updatedAt: entry.updatedAt || ""
				};
			});
		}
		return out;
	}

	return {
		createValueState: createValueState,
		createMapState: createMapState,
		createBoundedMapState: createBoundedMapState,
		readValue: readValue,
		writeValue: writeValue,
		readMap: readMap,
		writeMap: writeMap,
		readBoundedMap: readBoundedMap,
		writeBoundedMap: writeBoundedMap,
		clearValue: clearValue,
		clearMap: clearMap,
		clearBoundedMap: clearBoundedMap,
		clearMapWhere: clearMapWhere,
		summary: summary
	};
}())
