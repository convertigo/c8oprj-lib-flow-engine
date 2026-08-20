(function () {
	var FORMAT = "convertigo-flow-svelte-provider";
	var VERSION = 1;
	var PROVIDERS = Object.freeze({
		"src-builder/frontDocumentCli.ts": Object.freeze({
			name: "frontDocumentCli",
			source: "src-builder/frontDocumentCli.ts",
			bundle: "provider-dist/frontDocumentCli.mjs"
		}),
		"src-builder/sourceMutateCli.ts": Object.freeze({
			name: "sourceMutateCli",
			source: "src-builder/sourceMutateCli.ts",
			bundle: "provider-dist/sourceMutateCli.mjs"
		})
	});
	var REQUIRED_SOURCES = Object.freeze([
		"package.json",
		"package-lock.json",
		"tsconfig.json",
		"src-builder/buildProvider.mjs",
		"src-builder/frontDocumentCli.ts",
		"src-builder/sourceMutateCli.ts"
	]);

	function stableStringify(value) {
		if (value === null || typeof value !== "object") {
			return JSON.stringify(value);
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return "[" + value.map(stableStringify).join(",") + "]";
		}
		return "{" + Object.keys(value).sort().map(function (key) {
			return JSON.stringify(key) + ":" + stableStringify(value[key]);
		}).join(",") + "}";
	}

	function stateFor(state) {
		state.cache = state.cache || {};
		state.rejected = state.rejected || {};
		state.stats = state.stats || {};
		return state;
	}

	function bump(state, key) {
		stateFor(state);
		state.stats[key] = Number(state.stats[key] || 0) + 1;
	}

	function fallback(state, reason, details, signature) {
		bump(state, "tsxSelections");
		bump(state, reason);
		return {
			kind: "tsx",
			reason: reason,
			details: details || "",
			signature: signature || ""
		};
	}

	function safeRelativePath(value) {
		var path = String(value || "").replace(/\\/g, "/");
		if (!path || path.charAt(0) === "/" || /^[A-Za-z]:/.test(path)) {
			return "";
		}
		var parts = path.split("/");
		for (var i = 0; i < parts.length; i++) {
			if (!parts[i] || parts[i] === "." || parts[i] === "..") {
				return "";
			}
		}
		return parts.join("/");
	}

	function validFingerprint(entry) {
		return entry && safeRelativePath(entry.path) === String(entry.path)
			&& Number(entry.size) >= 0 && Math.floor(Number(entry.size)) === Number(entry.size)
			&& /^[0-9a-f]{64}$/.test(String(entry.sha256 || ""));
	}

	function manifestPayload(manifest) {
		return {
			format: manifest.format,
			version: manifest.version,
			build: manifest.build,
			sources: manifest.sources,
			providers: manifest.providers
		};
	}

	function validateShape(manifest, env) {
		if (!manifest || manifest.format !== FORMAT || Number(manifest.version) !== VERSION) {
			return "unsupported manifest format or version";
		}
		var build = manifest.build || {};
		if (build.tool !== "esbuild" || !String(build.toolVersion || "") || build.bundle !== true
				|| build.platform !== "node" || build.moduleFormat !== "esm"
				|| build.target !== "node20" || build.packages !== "external") {
			return "unsupported provider build contract";
		}
		var entries = build.entryPoints || {};
		if (entries.frontDocumentCli !== PROVIDERS["src-builder/frontDocumentCli.ts"].source
				|| entries.sourceMutateCli !== PROVIDERS["src-builder/sourceMutateCli.ts"].source) {
			return "provider entry points do not match the manifest contract";
		}
		if (Object.prototype.toString.call(manifest.sources) !== "[object Array]" || !manifest.sources.length) {
			return "provider manifest has no source inventory";
		}
		var seen = {};
		for (var i = 0; i < manifest.sources.length; i++) {
			var source = manifest.sources[i];
			if (!validFingerprint(source) || seen[source.path]) {
				return "provider source inventory is invalid or duplicated";
			}
			seen[source.path] = true;
		}
		for (var r = 0; r < REQUIRED_SOURCES.length; r++) {
			if (!seen[REQUIRED_SOURCES[r]]) {
				return "provider source inventory misses " + REQUIRED_SOURCES[r];
			}
		}
		var providers = manifest.providers || {};
		var names = ["frontDocumentCli", "sourceMutateCli"];
		for (var p = 0; p < names.length; p++) {
			var name = names[p];
			var expected = PROVIDERS["src-builder/" + name + ".ts"];
			var provider = providers[name];
			if (!validFingerprint(provider) || provider.source !== expected.source || provider.path !== expected.bundle) {
				return "provider output contract is invalid for " + name;
			}
		}
		if (!/^[0-9a-f]{64}$/.test(String(manifest.payloadSha256 || ""))
				|| env.sha256Text(stableStringify(manifestPayload(manifest))) !== manifest.payloadSha256) {
			return "provider manifest checksum is invalid";
		}
		return "";
	}

	function fileInventory(root, manifest, env) {
		var entries = manifest.sources.concat([
			manifest.providers.frontDocumentCli,
			manifest.providers.sourceMutateCli
		]);
		var inventory = [];
		for (var i = 0; i < entries.length; i++) {
			var entry = entries[i];
			var file = env.resolve(root, entry.path);
			var info = env.fileInfo(file);
			inventory.push({ entry: entry, file: file, info: info, output: i >= manifest.sources.length });
		}
		return inventory;
	}

	function inventoryKey(manifestInfo, inventory) {
		return [manifestInfo.size, manifestInfo.mtime].concat(inventory.map(function (item) {
			return item.entry.path + "\n" + (item.info.exists ? item.info.size : -1) + "\n" + (item.info.exists ? item.info.mtime : -1);
		})).join("\n");
	}

	function validateFiles(inventory, env) {
		for (var i = 0; i < inventory.length; i++) {
			var item = inventory[i];
			if (!item.info.exists) {
				return {
					status: item.output ? "absent" : "stale",
					details: "missing " + item.entry.path
				};
			}
			if (Number(item.info.size) !== Number(item.entry.size)) {
				return {
					status: item.output ? "corrupt" : "stale",
					details: "size changed for " + item.entry.path
				};
			}
			if (env.sha256File(item.file) !== item.entry.sha256) {
				return {
					status: item.output ? "corrupt" : "stale",
					details: "hash changed for " + item.entry.path
				};
			}
		}
		return { status: "valid", details: "" };
	}

	function readManifest(root, manifestFile, manifestInfo, cached, env) {
		var metaKey = String(manifestInfo.size) + "\n" + String(manifestInfo.mtime);
		if (cached && cached.manifestMetaKey === metaKey && cached.manifest) {
			return { manifest: cached.manifest, metaKey: metaKey };
		}
		return {
			manifest: JSON.parse(env.readText(manifestFile)),
			metaKey: metaKey
		};
	}

	function select(root, script, state, env) {
		stateFor(state);
		var provider = PROVIDERS[String(script || "")];
		if (!provider) {
			return fallback(state, "unsupported", "no precompiled provider for " + script);
		}
		root = env.canonical(root);
		var manifestFile = env.resolve(root, "provider-dist/provider-manifest.json");
		var manifestInfo = env.fileInfo(manifestFile);
		if (!manifestInfo.exists) {
			delete state.cache[root];
			return fallback(state, "absent", "provider manifest is absent");
		}
		var cached = state.cache[root];
		var read;
		try {
			read = readManifest(root, manifestFile, manifestInfo, cached, env);
		} catch (error) {
			state.cache[root] = {
				manifestMetaKey: String(manifestInfo.size) + "\n" + String(manifestInfo.mtime),
				result: { status: "corrupt", details: String(error && error.message || error) }
			};
			return fallback(state, "corrupt", "provider manifest is not valid JSON");
		}
		var manifest = read.manifest;
		var shapeError = validateShape(manifest, env);
		if (shapeError) {
			state.cache[root] = {
				manifestMetaKey: read.metaKey,
				manifest: manifest,
				result: { status: "corrupt", details: shapeError }
			};
			return fallback(state, "corrupt", shapeError);
		}
		var inventory = fileInventory(root, manifest, env);
		var key = inventoryKey(manifestInfo, inventory);
		var validation;
		if (cached && cached.inventoryKey === key && cached.result) {
			validation = cached.result;
			bump(state, "validationCacheHits");
		} else {
			try {
				validation = validateFiles(inventory, env);
			} catch (error) {
				validation = {
					status: "corrupt",
					details: "unable to validate provider files: " + String(error && error.message || error)
				};
			}
			bump(state, "validations");
			state.cache[root] = {
				manifestMetaKey: read.metaKey,
				manifest: manifest,
				inventoryKey: key,
				result: validation
			};
		}
		if (validation.status !== "valid") {
			return fallback(state, validation.status, validation.details,
				manifest.payloadSha256 + ":" + env.sha256Text(key));
		}
		var rejectionKey = root + "\n" + provider.name + "\n" + manifest.payloadSha256;
		if (state.rejected[rejectionKey]) {
			return fallback(state, "launchRejected", String(state.rejected[rejectionKey]), manifest.payloadSha256);
		}
		bump(state, "compiledSelections");
		bump(state, "valid");
		return {
			kind: "compiled",
			reason: "valid",
			details: "",
			bundle: env.resolve(root, manifest.providers[provider.name].path),
			signature: manifest.payloadSha256,
			provider: provider.name,
			rejectionKey: rejectionKey
		};
	}

	function reject(selection, state, reason) {
		stateFor(state);
		if (!selection || selection.kind !== "compiled" || !selection.rejectionKey) {
			return;
		}
		state.rejected[selection.rejectionKey] = String(reason || "launch failed");
		bump(state, "launchFallbacks");
	}

	function clear(state) {
		state.cache = {};
		state.rejected = {};
		state.stats = {};
	}

	return {
		format: FORMAT,
		version: VERSION,
		stableStringify: stableStringify,
		select: select,
		reject: reject,
		clear: clear
	};
}())
