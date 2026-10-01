(function () {
	var DEFAULT_HOT_CATALOG_PROBE_INTERVAL_MS = 60000;

	function blockIdFromDescriptorFile(file, blocksDir, env) {
		var relative = env.resourceRelativePath(blocksDir, file);
		if (!relative || !String(relative).endsWith(".block.js")) {
			return "";
		}
		relative = String(relative);
		relative = relative.substring(0, relative.length - ".block.js".length);
		return relative.replace(/\//g, ".");
	}

	function sortedFiles(dir, env) {
		if (env.sources) return dir ? env.sources.files(dir) : [];
		var files = dir && dir.listFiles();
		if (!files) {
			return [];
		}
		files = env.Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		return files;
	}
	function isFile(file, env) { return env.sources ? env.sources.isFile(file) : file.isFile(); }
	function isDirectory(file, env) { return env.sources ? env.sources.isDirectory(file) : file.isDirectory(); }
	function sourceForFile(file, env) {
		return env.sources ? env.sources.read(file) : String(env.FileUtils.readFileToString(file, "UTF-8"));
	}

	function blocksBaseDir(origin, env) {
		return origin === "core" ? new env.File(env.engineDir(), "blocks") : env.projectBlocksDir();
	}

	function projectNameFromRoot(projectRoot, env) {
		return projectRoot && typeof env.projectNameForRoot === "function"
			? String(env.projectNameForRoot(projectRoot) || "")
			: projectRoot ? String(projectRoot.getName() || "") : "";
	}

	function referencedContentDir(root, relativePath, env) {
		return new env.File(root, String(relativePath || env.sourcePaths.path("blocks")));
	}

	function projectRootCandidate(parent, name, relativePath, env) {
		var slug = String(name || "").replace(/_/g, "-");
		var candidates = [
			new env.File(parent, name),
			new env.File(parent, "c8oprj-" + name),
			new env.File(parent, slug),
			new env.File(parent, "c8oprj-" + slug)
		];
		for (var i = 0; i < candidates.length; i++) {
			var root = candidates[i];
			if (isDirectory(referencedContentDir(root, relativePath, env), env)) {
				return root;
			}
		}
		if (typeof env.projectRootForName === "function") {
			try {
				var loadedRoot = env.projectRootForName(name);
				if (loadedRoot && isDirectory(referencedContentDir(loadedRoot, relativePath, env), env)) {
					return loadedRoot;
				}
			} catch (e) {
			}
		}
		return null;
	}

	function referencedProjectRoots(env, relativePath, explicitProjectRoot) {
		var roots = [];
		var projectRoot = explicitProjectRoot || env.projectDir();
		if (!projectRoot) {
			return roots;
		}
		var descriptor = new env.File(projectRoot, "c8oProject.yaml");
		if (!descriptor.isFile()) {
			return roots;
		}
		var source = String(env.FileUtils.readFileToString(descriptor, "UTF-8"));
		var parent = projectRoot.getParentFile();
		var currentName = projectNameFromRoot(projectRoot, env);
		var engineName = env.flowProviderName(env.engineDir(), "lib_flow_engine");
		var seen = {};
		var matcher = /projectName:\s*([A-Za-z0-9_.-]+)/g;
		var match;
		while ((match = matcher.exec(source)) !== null) {
			var name = String(match[1] || "").trim();
			if (!name || name === currentName || name === engineName || seen[name]) {
				continue;
			}
			seen[name] = true;
			var root = projectRootCandidate(parent, name, relativePath, env);
			if (root) {
				roots.push(root);
			}
		}
		return roots;
	}

	function referencedBlocksDir(root, env) {
		return new env.File(root, env.sourcePaths.path("blocks"));
	}

	function loadBlockDir(blocks, blocksDir, origin, provider, env, baseDir) {
		baseDir = baseDir || blocksBaseDir(origin, env);
		sortedFiles(blocksDir, env).forEach(function (file) {
			if (isDirectory(file, env)) {
				loadBlockDir(blocks, file, origin, provider, env, baseDir);
				return;
			}
			if (!isFile(file, env)) {
				return;
			}
			if (String(file.getName()).endsWith(".block.js")) {
				env.loadFlowScriptBlockFile(blocks, file, origin, provider, baseDir);
			}
		});
	}

	function reserveBlockDir(blocks, blocksDir, origin, provider, env, baseDir) {
		baseDir = baseDir || blocksBaseDir(origin, env);
		sortedFiles(blocksDir, env).forEach(function (file) {
			if (isDirectory(file, env)) {
				reserveBlockDir(blocks, file, origin, provider, env, baseDir);
				return;
			}
			if (!isFile(file, env)) {
				return;
			}
			if (String(file.getName()).endsWith(".block.js")) {
				env.reserveFlowScriptBlockFile(blocks, file, origin, provider, baseDir);
			}
		});
	}

	function blocksCacheIdentity(env) {
		var coreBlocksDir = new env.File(env.engineDir(), "blocks");
		var coreKey = [
			"engine", env.canonicalPath(env.engineDir()),
			"core", env.directoryFingerprint(coreBlocksDir)
		];
		var key = coreKey.slice();
		var localBlocksDir = env.projectBlocksDir();
		if (localBlocksDir && env.canonicalPath(localBlocksDir) !== env.canonicalPath(coreBlocksDir)) {
			referencedProjectRoots(env, env.sourcePaths.path("blocks")).forEach(function (root) {
				var refBlocksDir = referencedBlocksDir(root, env);
				key.push("reference", env.canonicalPath(root), env.directoryFingerprint(refBlocksDir));
			});
			key.push("project", env.canonicalPath(env.projectDir()), env.directoryFingerprint(localBlocksDir));
			// The recorded definer versions select historical defaults.
			var dependencies = new env.File(env.projectDir(), env.sourcePaths.path("dependencies.json"));
			key.push("dependencies", dependencies.isFile() ? dependencies.lastModified() + ":" + dependencies.length() : "none");
		}
		if (typeof env.sourceDraftsFingerprint === "function") {
			var draftsFingerprint = env.sourceDraftsFingerprint();
			if (draftsFingerprint) {
				key.push("drafts", draftsFingerprint);
				coreKey.push("drafts", draftsFingerprint);
			}
		}
		return {
			key: key.join("\n"),
			coreKey: coreKey.join("\n")
		};
	}

	function blocksCacheKey(env) {
		return blocksCacheIdentity(env).key;
	}

	function blockCatalogHeadKey(env) {
		var key = [
			"engine", env.canonicalPath(env.engineDir()),
			"project", env.projectDir() ? env.canonicalPath(env.projectDir()) : ""
		];
		if (typeof env.sourceDraftsFingerprint === "function") {
			var draftsFingerprint = env.sourceDraftsFingerprint();
			if (draftsFingerprint) {
				key.push("drafts", draftsFingerprint);
			}
		}
		return key.join("\n");
	}

	function readHotBlockCatalog(env) {
		var cache = env.blockCatalogHeadCache;
		if (!cache || !cache.entries) {
			return null;
		}
		var entry = cache.entries[blockCatalogHeadKey(env)];
		var now = env.currentTimeMillis ? env.currentTimeMillis() : new Date().getTime();
		var configuredInterval = env.blockCatalogProbeIntervalMs;
		var interval = Math.max(0, Number(configuredInterval === undefined || configuredInterval === null
			? DEFAULT_HOT_CATALOG_PROBE_INTERVAL_MS
			: configuredInterval));
		if (entry && now - Number(entry.checkedAt || 0) < interval) {
			cache.hits++;
			return entry.value;
		}
		cache.misses++;
		return null;
	}

	function writeHotBlockCatalog(env, blocks) {
		var cache = env.blockCatalogHeadCache;
		if (!cache || !cache.entries) {
			return blocks;
		}
		var now = env.currentTimeMillis ? env.currentTimeMillis() : new Date().getTime();
		cache.entries[blockCatalogHeadKey(env)] = {
			value: blocks,
			checkedAt: now,
			updatedAt: new Date(now).toISOString()
		};
		cache.label = "hot block catalogs";
		cache.updatedAt = new Date(now).toISOString();
		return blocks;
	}

	function attachCatalogFingerprint(blocks, fingerprint) {
		if (!blocks || !fingerprint) {
			return blocks;
		}
		try {
			Object.defineProperty(blocks, "__flowCatalogFingerprint", {
				value: String(fingerprint),
				enumerable: false,
				configurable: false,
				writable: false
			});
		} catch (e) {
			// A cached catalog from an older runtime remains usable but is not globally shareable.
		}
		return blocks;
	}

	function loadCoreBlocks(env, coreKey) {
		var cached = env.readRuntimeCache(env.coreBlockCache, coreKey, coreKey);
		if (cached) {
			return cached;
		}
		var blocks = {};
		var coreBlocksDir = new env.File(env.engineDir(), "blocks");
		reserveBlockDir(blocks, coreBlocksDir, "core", env.flowProviderName(env.engineDir(), "lib_flow_engine"), env);
		return env.writeRuntimeCache(env.coreBlockCache, coreKey, coreKey, blocks, "core Flow blocks");
	}

	function loadBlocksUncached(env, coreKey) {
		coreKey = coreKey || blocksCacheIdentity(env).coreKey;
		var coreBlocks = loadCoreBlocks(env, coreKey);
		var blocks = Object.assign({}, coreBlocks);
		var coreBlocksDir = new env.File(env.engineDir(), "blocks");
		var localBlocksDir = env.projectBlocksDir();
		if (localBlocksDir && env.canonicalPath(localBlocksDir) !== env.canonicalPath(coreBlocksDir)) {
			referencedProjectRoots(env, env.sourcePaths.path("blocks")).forEach(function (root) {
				var refBlocksDir = referencedBlocksDir(root, env);
				reserveBlockDir(blocks, refBlocksDir, "reference", projectNameFromRoot(root, env), env, refBlocksDir);
			});
			reserveBlockDir(blocks, localBlocksDir, "project",
				env.flowProviderName(new env.File(env.projectDir(), env.sourcePaths.root), "project"), env);
		}
		if (typeof env.blocksDefaultsHistory === "function") {
			Object.defineProperty(blocks, "__flowDefaultsHistory", { value: env.blocksDefaultsHistory(blocks), enumerable: false });
		}
		return blocks;
	}

	function loadBlocks(env, allowHot) {
		if (allowHot === true) {
			var hot = readHotBlockCatalog(env);
			if (hot) {
				return hot;
			}
		}
		var identity = blocksCacheIdentity(env);
		var key = identity.key;
		var cached = env.readRuntimeCache(env.blockCache, key, key);
		if (cached) {
			return writeHotBlockCatalog(env, attachCatalogFingerprint(cached, key));
		}
		function buildOrReadCatalog() {
			// Another cold request may have populated the exact generation while this one waited.
			var currentIdentity = blocksCacheIdentity(env);
			var currentKey = currentIdentity.key;
			var current = env.readRuntimeCache(env.blockCache, currentKey, currentKey);
			if (current) {
				return writeHotBlockCatalog(env, attachCatalogFingerprint(current, currentKey));
			}
			return writeHotBlockCatalog(env, attachCatalogFingerprint(env.writeRuntimeCache(
				env.blockCache,
				currentKey,
				currentKey,
				loadBlocksUncached(env, currentIdentity.coreKey),
				"blocks for " + (env.projectDir() ? env.canonicalPath(env.projectDir()) : "no project")
			), currentKey));
		}
		return typeof env.withBlockCatalogBuild === "function"
			? env.withBlockCatalogBuild(blockCatalogHeadKey(env), buildOrReadCatalog)
			: buildOrReadCatalog();
	}

	function loadTypeDescriptorFile(types, file, origin, env) {
		var source = sourceForFile(file, env);
		var type = env.validateTypeDescriptorSource(env.resourceName(file.getName()), source);
		if (types[type.name]) {
			env.raise("DUPLICATE_TYPE", "Duplicate Flow property type: " + type.name,
				null, "Rename the project type or remove the duplicate.");
		}
		type.__flowOrigin = origin;
		type.__flowFile = file.getAbsolutePath();
		types[type.name] = type;
		return type;
	}

	function loadTypeDir(types, typesDir, origin, env, provider) {
		sortedFiles(typesDir, env).forEach(function (file) {
			if (!isFile(file, env) || !String(file.getName()).endsWith(".type.yaml")) {
				return;
			}
			if (origin === "reference") {
				// A referenced project shares its types (e.g. the editor of its components'
				// properties); the core, this project and earlier references take precedence.
				var source = sourceForFile(file, env);
				var type = env.validateTypeDescriptorSource(env.resourceName(file.getName()), source);
				if (types[type.name]) return;
				type.__flowOrigin = origin;
				type.__flowProvider = provider || "";
				type.__flowFile = file.getAbsolutePath();
				types[type.name] = type;
				return;
			}
			loadTypeDescriptorFile(types, file, origin, env);
		});
	}

	function referencedTypeDirs(env) {
		var coreTypesDir = new env.File(env.engineDir(), "types");
		var localTypesDir = env.projectTypesDir();
		return referencedProjectRoots(env, env.sourcePaths.path("types")).map(function (root) {
			return { root: root, dir: new env.File(root, env.sourcePaths.path("types")) };
		}).filter(function (entry) {
			var path = env.canonicalPath(entry.dir);
			return isDirectory(entry.dir, env) && path !== env.canonicalPath(coreTypesDir)
				&& !(localTypesDir && path === env.canonicalPath(localTypesDir));
		});
	}

	function typesCacheKey(env) {
		var coreTypesDir = new env.File(env.engineDir(), "types");
		var key = [
			"engine", env.canonicalPath(env.engineDir()),
			"sources", env.sourceDraftsFingerprint ? env.sourceDraftsFingerprint() : "",
			"core", env.directoryFingerprint(coreTypesDir)
		];
		var localTypesDir = env.projectTypesDir();
		if (localTypesDir && env.canonicalPath(localTypesDir) !== env.canonicalPath(coreTypesDir)) {
			key.push("project", env.canonicalPath(env.projectDir()), env.directoryFingerprint(localTypesDir));
		}
		referencedTypeDirs(env).forEach(function (entry) {
			key.push("reference", env.canonicalPath(entry.dir), env.directoryFingerprint(entry.dir));
		});
		return key.join("\n");
	}

	function loadTypesUncached(env) {
		var types = {};
		var coreTypesDir = new env.File(env.engineDir(), "types");
		loadTypeDir(types, coreTypesDir, "core", env);
		var localTypesDir = env.projectTypesDir();
		if (localTypesDir && env.canonicalPath(localTypesDir) !== env.canonicalPath(coreTypesDir)) {
			loadTypeDir(types, localTypesDir, "project", env);
		}
		referencedTypeDirs(env).forEach(function (entry) {
			loadTypeDir(types, entry.dir, "reference", env, projectNameFromRoot(entry.root, env));
		});
		return types;
	}

	function loadTypes(env) {
		var key = typesCacheKey(env);
		var cached = env.readRuntimeCache(env.typeCache, key, key);
		if (cached) {
			return cached;
		}
		return env.writeRuntimeCache(env.typeCache, key, key, loadTypesUncached(env),
			"types for " + (env.projectDir() ? env.canonicalPath(env.projectDir()) : "no project"));
	}

	// Traits (spec-flow-catalog-composition-v1): *.trait.js files with a leading _meta,
	// from the core, this project and referenced projects, like types.
	function traitDirs(env, extraDirs) {
		var dirs = [{ dir: new env.File(env.engineDir(), "traits"), origin: "core" }];
		var project = env.projectDir();
		if (project) dirs.push({ dir: new env.File(project, env.sourcePaths.path("traits")), origin: "project" });
		referencedProjectRoots(env, env.sourcePaths.path("traits")).forEach(function (root) {
			dirs.push({ dir: new env.File(root, env.sourcePaths.path("traits")), origin: "reference" });
		});
		// Providers (the Svelte frontbuilder) keep their traits in their project's _flow/traits.
		(extraDirs || []).forEach(function (dir) {
			dirs.push({ dir: dir, origin: "reference" });
		});
		var seen = {};
		return dirs.filter(function (entry) {
			var path = env.canonicalPath(entry.dir);
			if (!isDirectory(entry.dir, env) || seen[path]) return false;
			seen[path] = true;
			return true;
		});
	}

	function traitFiles(dir, env) {
		var files = [];
		sortedFiles(dir, env).forEach(function (file) {
			if (isDirectory(file, env)) files = files.concat(traitFiles(file, env));
			else if (String(file.getName()).endsWith(".trait.js")) files.push(file);
		});
		return files;
	}

	function traitsCacheKey(env, extraDirs) {
		return (env.sourceDraftsFingerprint ? env.sourceDraftsFingerprint() : "") + "\n" + traitDirs(env, extraDirs).map(function (entry) {
			return entry.origin + ":" + traitFiles(entry.dir, env).map(function (file) {
				return env.canonicalPath(file) + "@" + file.lastModified() + ":" + file.length();
			}).join(",");
		}).join("\n") || "none";
	}

	function loadTraitsUncached(env, extraDirs) {
		var traits = {};
		traitDirs(env, extraDirs).forEach(function (entry) {
			traitFiles(entry.dir, env).forEach(function (file) {
				var meta = env.extractFlowScriptBlockMeta(sourceForFile(file, env)).meta || {};
				var name = String(meta.name || "");
				if (!name) {
					env.raise("TRAIT_NAME_REQUIRED", "Trait " + file.getName() + " must declare its name in _meta.");
				}
				if (traits[name]) {
					if (entry.origin === "reference") return;
					env.raise("DUPLICATE_TRAIT", "Duplicate Flow trait: " + name, null, "Rename the project trait or remove the duplicate.");
				}
				meta.__flowOrigin = entry.origin;
				meta.__flowFile = file.getAbsolutePath();
				traits[name] = meta;
			});
		});
		return traits;
	}

	function loadTraits(env, extraDirs) {
		var key = "traits\n" + traitsCacheKey(env, extraDirs);
		var cached = env.readRuntimeCache(env.typeCache, key, key);
		if (cached) {
			return cached;
		}
		return env.writeRuntimeCache(env.typeCache, key, key, loadTraitsUncached(env, extraDirs),
			"traits for " + (env.projectDir() ? env.canonicalPath(env.projectDir()) : "no project"));
	}

	return {
		loadTraits: loadTraits,
		blockIdFromDescriptorFile: blockIdFromDescriptorFile,
		referencedProjectRoots: referencedProjectRoots,
		loadBlockDir: loadBlockDir,
		reserveBlockDir: reserveBlockDir,
		blocksCacheKey: blocksCacheKey,
		loadBlocksUncached: loadBlocksUncached,
		loadBlocks: loadBlocks,
		loadTypeDescriptorFile: loadTypeDescriptorFile,
		loadTypeDir: loadTypeDir,
		typesCacheKey: typesCacheKey,
		loadTypesUncached: loadTypesUncached,
		loadTypes: loadTypes
	};
}())
