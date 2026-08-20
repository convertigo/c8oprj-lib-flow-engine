(function () {
	var FORMAT_VERSION = 1;
	var DEFAULT_MAX_ENTRIES = 256;
	var DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
	var DEFAULT_MEMORY_MAX_ENTRIES = 32;
	var DEFAULT_MEMORY_MAX_BYTES = 16 * 1024 * 1024;

	function stableValue(value) {
		if (value === null || value === undefined || typeof value !== "object") {
			return value;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(stableValue);
		}
		var out = {};
		Object.keys(value).sort().forEach(function (key) {
			out[key] = stableValue(value[key]);
		});
		return out;
	}

	function stableStringify(value) {
		return JSON.stringify(stableValue(value));
	}

	function increment(stats, name, amount) {
		stats[name] = Number(stats[name] || 0) + Number(amount === undefined ? 1 : amount);
	}

	function cause(stats, value) {
		stats.lastCause = String(value || "");
	}

	function currentTimeMillis(env) {
		return typeof env.currentTimeMillis === "function"
			? Number(env.currentTimeMillis())
			: new Date().getTime();
	}

	function canonicalPath(file, env) {
		return String(env.canonicalPath(file));
	}

	function sortedFiles(files, env) {
		return (files || []).slice().sort(function (left, right) {
			return canonicalPath(left, env).localeCompare(canonicalPath(right, env));
		});
	}

	function inventoryForFiles(files, env) {
		return sortedFiles(files, env).map(function (file) {
			return {
				file: file,
				path: canonicalPath(file, env),
				size: Number(file.length()),
				mtime: Number(file.lastModified()),
				hash: ""
			};
		});
	}

	function serializableInventory(inventory) {
		return inventory.map(function (entry) {
			return {
				path: entry.path,
				size: entry.size,
				mtime: entry.mtime,
				hash: entry.hash
			};
		});
	}

	function inventoryMap(inventory) {
		var out = {};
		(inventory || []).forEach(function (entry) {
			out[String(entry.path || "")] = entry;
		});
		return out;
	}

	function snapshotIdentity(request) {
		return stableStringify({
			version: FORMAT_VERSION,
			scope: String(request.scope || "catalog"),
			closure: request.closure || {},
			extractor: String(request.extractor || "")
		});
	}

	function snapshotFile(request, env) {
		var root = env.cacheDir();
		if (!root) {
			return null;
		}
		if (!root.isDirectory()) {
			root.mkdirs();
		}
		return new env.File(root, env.sha256Hex(snapshotIdentity(request)) + ".json");
	}

	function memoryEntries(env) {
		return env.memory && env.memory.entries ? env.memory.entries : null;
	}

	function memoryKey(file, env) {
		return file ? canonicalPath(file, env) : "";
	}

	function memoryDelete(file, env) {
		var entries = memoryEntries(env);
		var key = memoryKey(file, env);
		if (entries && key) {
			delete entries[key];
		}
	}

	function pruneMemory(env) {
		var entries = memoryEntries(env);
		if (!entries) {
			return;
		}
		var rows = Object.keys(entries).map(function (key) {
			return { key: key, entry: entries[key] };
		}).sort(function (left, right) {
			return Number(left.entry.accessedAt || 0) - Number(right.entry.accessedAt || 0);
		});
		var maxEntries = Math.max(1, Number(env.memoryMaxEntries || DEFAULT_MEMORY_MAX_ENTRIES));
		var maxBytes = Math.max(1024, Number(env.memoryMaxBytes || DEFAULT_MEMORY_MAX_BYTES));
		var bytes = rows.reduce(function (sum, row) { return sum + Number(row.entry.bytes || 0); }, 0);
		while (rows.length > maxEntries || bytes > maxBytes) {
			var victim = rows.shift();
			bytes -= Number(victim.entry.bytes || 0);
			delete entries[victim.key];
			increment(env.stats, "memoryEvictions");
		}
	}

	function rememberEnvelope(file, envelope, env) {
		var entries = memoryEntries(env);
		var key = memoryKey(file, env);
		if (!entries || !key || !envelope) {
			return;
		}
		var copy = env.normalizeTree(envelope);
		entries[key] = {
			identity: String(copy.identity || ""),
			envelope: copy,
			bytes: stableStringify(copy).length,
			accessedAt: currentTimeMillis(env)
		};
		pruneMemory(env);
	}

	function readMemoryEnvelope(file, request, env) {
		var entries = memoryEntries(env);
		var key = memoryKey(file, env);
		var cached = entries && key ? entries[key] : null;
		if (!cached || String(cached.identity || "") !== snapshotIdentity(request)) {
			return null;
		}
		cached.accessedAt = currentTimeMillis(env);
		return cached.envelope;
	}

	function deleteQuietly(file) {
		try {
			if (file) {
				file["delete"]();
			}
		} catch (ignored) {
		}
	}

	function payloadChecksum(payload, env) {
		return env.sha256Hex(stableStringify(payload));
	}

	function readEnvelope(file, request, env) {
		if (!file || !file.isFile()) {
			return null;
		}
		var stats = env.stats;
		try {
			var envelope = JSON.parse(String(env.readText(file)));
			if (!envelope || envelope.version !== FORMAT_VERSION ||
					String(envelope.identity || "") !== snapshotIdentity(request) ||
					!envelope.payload || !envelope.inventory ||
					String(envelope.payloadChecksum || "") !== payloadChecksum(envelope.payload, env)) {
				throw new Error("Invalid catalog snapshot envelope.");
			}
			if (typeof request.validate === "function" && request.validate(envelope.payload) !== true) {
				throw new Error("Invalid catalog snapshot payload.");
			}
			return envelope;
		} catch (e) {
			increment(stats, "corrupt");
			cause(stats, "corrupt:" + String(e && e.message || e));
			memoryDelete(file, env);
			deleteQuietly(file);
			return null;
		}
	}

	function hashEntry(entry, env) {
		var started = currentTimeMillis(env);
		entry.hash = String(env.fileContentHash(entry.file));
		increment(env.stats, "hashedFiles");
		increment(env.stats, "hashedBytes", entry.size);
		increment(env.stats, "hashMs", currentTimeMillis(env) - started);
		return entry.hash;
	}

	function validateInventory(current, previous, request, env) {
		var oldByPath = inventoryMap(previous);
		var currentByPath = inventoryMap(current);
		var previousPaths = Object.keys(oldByPath).sort();
		var currentPaths = Object.keys(currentByPath).sort();
		if (previousPaths.join("\n") !== currentPaths.join("\n")) {
			return { valid: false, reason: "paths-changed", metadataChanged: true };
		}
		var suspects = request.suspectPaths || {};
		var metadataChanged = false;
		for (var i = 0; i < current.length; i++) {
			var entry = current[i];
			var old = oldByPath[entry.path];
			if (!old || !old.hash) {
				return { valid: false, reason: "missing-hash", metadataChanged: true };
			}
			var suspect = suspects[entry.path] === true;
			if (!suspect && Number(old.size) === entry.size && Number(old.mtime) === entry.mtime) {
				entry.hash = String(old.hash);
				continue;
			}
			metadataChanged = true;
			if (hashEntry(entry, env) !== String(old.hash)) {
				return { valid: false, reason: suspect ? "suspect-content-changed" : "content-changed", metadataChanged: true };
			}
		}
		return { valid: true, reason: metadataChanged ? "metadata-refreshed" : "inventory-hit", metadataChanged: metadataChanged };
	}

	function writeEnvelope(file, envelope, env) {
		if (!file) {
			return false;
		}
		var text = JSON.stringify(envelope);
		try {
			env.writeAtomic(file, text);
			increment(env.stats, "writes");
			env.stats.lastWriteBytes = text.length;
			return true;
		} catch (e) {
			increment(env.stats, "errors");
			cause(env.stats, "write-error:" + String(e && e.message || e));
			return false;
		}
	}

	function envelopeFor(request, inventory, payload, env) {
		return {
			version: FORMAT_VERSION,
			identity: snapshotIdentity(request),
			createdAt: new Date(currentTimeMillis(env)).toISOString(),
			roots: (request.roots || []).slice(),
			inventory: serializableInventory(inventory),
			payloadChecksum: payloadChecksum(payload, env),
			payload: payload
		};
	}

	function prune(env) {
		var root = env.cacheDir();
		var listed = root && root.isDirectory() ? root.listFiles() : null;
		if (!listed) {
			return;
		}
		var files = env.Arrays.asList(listed).toArray().filter(function (file) {
			return file.isFile() && String(file.getName()).endsWith(".json");
		}).sort(function (left, right) {
			return Number(left.lastModified()) - Number(right.lastModified());
		});
		var maxEntries = Math.max(1, Number(env.maxEntries || DEFAULT_MAX_ENTRIES));
		var maxBytes = Math.max(1024, Number(env.maxBytes || DEFAULT_MAX_BYTES));
		var bytes = files.reduce(function (sum, file) { return sum + Number(file.length()); }, 0);
		while (files.length > maxEntries || bytes > maxBytes) {
			var victim = files.shift();
			bytes -= Number(victim.length());
			deleteQuietly(victim);
			increment(env.stats, "evictions");
		}
	}

	function rebuild(file, request, inventory, reason, env) {
		inventory.forEach(function (entry) {
			if (!entry.hash) {
				hashEntry(entry, env);
			}
		});
		var started = currentTimeMillis(env);
		var payload = env.normalizeTree(request.extract(sortedFiles(request.files || [], env)));
		increment(env.stats, "extractMs", currentTimeMillis(env) - started);
		if (typeof request.validate === "function" && request.validate(payload) !== true) {
			throw new Error("Fresh catalog snapshot payload failed validation.");
		}
		increment(env.stats, "rebuilds");
		cause(env.stats, reason || "rebuild");
		var envelope = envelopeFor(request, inventory, payload, env);
		writeEnvelope(file, envelope, env);
		rememberEnvelope(file, envelope, env);
		prune(env);
		return { payload: payload, hit: false, reason: reason || "rebuild" };
	}

	function load(request, env) {
		request = request || {};
		var started = currentTimeMillis(env);
		var inventory = inventoryForFiles(request.files || [], env);
		var file = snapshotFile(request, env);
		if (!file) {
			increment(env.stats, "misses");
			cause(env.stats, "workspace-cache-unavailable");
			return rebuild(null, request, inventory, "workspace-cache-unavailable", env);
		}
		var memoryEnvelope = readMemoryEnvelope(file, request, env);
		if (memoryEnvelope) {
			var memoryValidation = validateInventory(inventory, memoryEnvelope.inventory, request, env);
			increment(env.stats, "validationMs", currentTimeMillis(env) - started);
			if (memoryValidation.valid) {
				increment(env.stats, "hits");
				increment(env.stats, "memoryHits");
				cause(env.stats, memoryValidation.reason);
				if (memoryValidation.metadataChanged) {
					memoryEnvelope.inventory = serializableInventory(inventory);
					memoryEnvelope.createdAt = new Date(currentTimeMillis(env)).toISOString();
					writeEnvelope(file, memoryEnvelope, env);
					rememberEnvelope(file, memoryEnvelope, env);
				}
				file.setLastModified(currentTimeMillis(env));
				return { payload: env.normalizeTree(memoryEnvelope.payload), hit: true, reason: memoryValidation.reason };
			}
			memoryDelete(file, env);
			increment(env.stats, "stale");
			cause(env.stats, memoryValidation.reason);
			return rebuild(file, request, inventory, memoryValidation.reason, env);
		}
		var existed = file.isFile();
		var envelope = readEnvelope(file, request, env);
		if (envelope) {
			var validation = validateInventory(inventory, envelope.inventory, request, env);
			increment(env.stats, "validationMs", currentTimeMillis(env) - started);
			if (validation.valid) {
				increment(env.stats, "hits");
				increment(env.stats, "diskHits");
				cause(env.stats, validation.reason);
				if (validation.metadataChanged) {
					envelope.inventory = serializableInventory(inventory);
					envelope.createdAt = new Date(currentTimeMillis(env)).toISOString();
					writeEnvelope(file, envelope, env);
				}
				rememberEnvelope(file, envelope, env);
				file.setLastModified(currentTimeMillis(env));
				return { payload: env.normalizeTree(envelope.payload), hit: true, reason: validation.reason };
			}
			increment(env.stats, "stale");
			cause(env.stats, validation.reason);
			return rebuild(file, request, inventory, validation.reason, env);
		}
		increment(env.stats, "misses");
		increment(env.stats, "validationMs", currentTimeMillis(env) - started);
		return rebuild(file, request, inventory, existed ? "corrupt-rebuild" : "cache-miss", env);
	}

	function diskInfo(env) {
		var root = env.cacheDir();
		var listed = root && root.isDirectory() ? root.listFiles() : null;
		var entries = 0;
		var bytes = 0;
		if (listed) {
			env.Arrays.asList(listed).toArray().forEach(function (file) {
				if (file.isFile() && String(file.getName()).endsWith(".json")) {
					entries++;
					bytes += Number(file.length());
				}
			});
		}
		var memory = memoryEntries(env);
		var memoryKeys = memory ? Object.keys(memory) : [];
		return {
			entries: entries,
			bytes: bytes,
			path: root ? String(root.getAbsolutePath()) : "",
			memoryEntries: memoryKeys.length,
			memoryBytes: memoryKeys.reduce(function (sum, key) {
				return sum + Number(memory[key].bytes || 0);
			}, 0)
		};
	}

	function info(env) {
		var out = {};
		Object.keys(env.stats || {}).forEach(function (key) {
			out[key] = env.stats[key];
		});
		var disk = diskInfo(env);
		out.entries = disk.entries;
		out.bytes = disk.bytes;
		out.path = disk.path;
		out.memoryEntries = disk.memoryEntries;
		out.memoryBytes = disk.memoryBytes;
		out.version = FORMAT_VERSION;
		return out;
	}

	function invalidateRoot(rootPath, env) {
		rootPath = String(rootPath || "");
		if (!rootPath) {
			return 0;
		}
		var root = env.cacheDir();
		var listed = root && root.isDirectory() ? root.listFiles() : null;
		var removedKeys = {};
		var memory = memoryEntries(env);
		if (memory) {
			Object.keys(memory).forEach(function (key) {
				var envelope = memory[key] && memory[key].envelope || {};
				var matches = (envelope.roots || []).some(function (candidate) {
					candidate = String(candidate || "");
					return candidate === rootPath || candidate.indexOf(rootPath + env.File.separator) === 0 ||
						rootPath.indexOf(candidate + env.File.separator) === 0;
				});
				if (matches) {
					delete memory[key];
					removedKeys[key] = true;
				}
			});
		}
		if (!listed) {
			return Object.keys(removedKeys).length;
		}
		env.Arrays.asList(listed).toArray().forEach(function (file) {
			if (!file.isFile() || !String(file.getName()).endsWith(".json")) {
				return;
			}
			try {
				var envelope = JSON.parse(String(env.readText(file)));
				var matches = (envelope.roots || []).some(function (candidate) {
					candidate = String(candidate || "");
					return candidate === rootPath || candidate.indexOf(rootPath + env.File.separator) === 0 ||
						rootPath.indexOf(candidate + env.File.separator) === 0;
				});
				if (matches) {
					deleteQuietly(file);
					removedKeys[memoryKey(file, env)] = true;
				}
			} catch (e) {
				deleteQuietly(file);
				removedKeys[memoryKey(file, env)] = true;
			}
		});
		var removed = Object.keys(removedKeys).length;
		increment(env.stats, "invalidations", removed);
		if (removed) {
			cause(env.stats, "known-mutation");
		}
		return removed;
	}

	function clear(env) {
		var root = env.cacheDir();
		var listed = root && root.isDirectory() ? root.listFiles() : null;
		if (listed) {
			env.Arrays.asList(listed).toArray().forEach(deleteQuietly);
		}
		var memory = memoryEntries(env);
		if (memory) {
			Object.keys(memory).forEach(function (key) { delete memory[key]; });
		}
		return info(env);
	}

	return {
		formatVersion: FORMAT_VERSION,
		stableStringify: stableStringify,
		load: load,
		info: info,
		invalidateRoot: invalidateRoot,
		clear: clear
	};
}())
