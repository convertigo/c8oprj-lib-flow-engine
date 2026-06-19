(function () {
	function createValueState() {
		return {
			key: "",
			value: null,
			hits: 0,
			misses: 0,
			clears: 0,
			updatedAt: "",
			label: ""
		};
	}

	function createMapState() {
		return {
			entries: {},
			hits: 0,
			misses: 0,
			clears: 0,
			updatedAt: "",
			label: ""
		};
	}

	function now() {
		return new Date().toISOString();
	}

	function readValue(cache, key) {
		if (cache.value && cache.key === key) {
			cache.hits++;
			return cache.value;
		}
		cache.misses++;
		return null;
	}

	function writeValue(cache, key, value, label) {
		cache.key = key;
		cache.value = value;
		cache.label = label || "";
		cache.updatedAt = now();
		return value;
	}

	function readMap(cache, key, fingerprint) {
		var entry = cache.entries[key];
		if (entry && entry.fingerprint === fingerprint) {
			cache.hits++;
			return entry.value;
		}
		cache.misses++;
		return null;
	}

	function writeMap(cache, key, fingerprint, value, label) {
		cache.entries[key] = {
			fingerprint: fingerprint,
			value: value,
			updatedAt: now()
		};
		cache.label = label || "";
		cache.updatedAt = cache.entries[key].updatedAt;
		return value;
	}

	function clearValue(cache) {
		cache.key = "";
		cache.value = null;
		cache.clears++;
		cache.updatedAt = now();
	}

	function clearMap(cache) {
		cache.entries = {};
		cache.clears++;
		cache.updatedAt = now();
	}

	function clearMapWhere(cache, predicate) {
		var removed = 0;
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
			cache.clears++;
			cache.updatedAt = now();
		}
		return removed;
	}

	function summary(name, cache, includeEntries) {
		var entries = cache.entries ? Object.keys(cache.entries).sort() : [];
		var out = {
			name: name,
			warm: cache.entries ? entries.length > 0 : !!cache.value,
			hits: cache.hits,
			misses: cache.misses,
			clears: cache.clears,
			updatedAt: cache.updatedAt,
			label: cache.label,
			entryCount: entries.length || undefined
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
		readValue: readValue,
		writeValue: writeValue,
		readMap: readMap,
		writeMap: writeMap,
		clearValue: clearValue,
		clearMap: clearMap,
		clearMapWhere: clearMapWhere,
		summary: summary
	};
}())
