(function () {
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

	function blocksBaseDir(origin, env) {
		return origin === "core" ? new env.File(env.engineDir(), "blocks") : env.projectBlocksDir();
	}

	function projectNameFromRoot(projectRoot) {
		return projectRoot ? String(projectRoot.getName() || "") : "";
	}

	function projectRootCandidate(parent, name, env) {
		var slug = String(name || "").replace(/_/g, "-");
		var candidates = [
			new env.File(parent, name),
			new env.File(parent, "c8oprj-" + name),
			new env.File(parent, slug),
			new env.File(parent, "c8oprj-" + slug)
		];
		for (var i = 0; i < candidates.length; i++) {
			var root = candidates[i];
			if (referencedBlocksDir(root, env).isDirectory()) {
				return root;
			}
		}
		return null;
	}

	function referencedProjectRoots(env) {
		var roots = [];
		var projectRoot = env.projectDir();
		if (!projectRoot) {
			return roots;
		}
		var descriptor = new env.File(projectRoot, "c8oProject.yaml");
		if (!descriptor.isFile()) {
			return roots;
		}
		var source = String(env.FileUtils.readFileToString(descriptor, "UTF-8"));
		var parent = projectRoot.getParentFile();
		var currentName = projectNameFromRoot(projectRoot);
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
			var root = projectRootCandidate(parent, name, env);
			if (root) {
				roots.push(root);
			}
		}
		return roots;
	}

	function referencedBlocksDir(root, env) {
		return new env.File(root, "libs/flow/blocks");
	}

	function loadBlockDir(blocks, blocksDir, origin, provider, env, baseDir) {
		baseDir = baseDir || blocksBaseDir(origin, env);
		sortedFiles(blocksDir, env).forEach(function (file) {
			if (file.isDirectory()) {
				loadBlockDir(blocks, file, origin, provider, env, baseDir);
				return;
			}
			if (!file.isFile()) {
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
			if (file.isDirectory()) {
				reserveBlockDir(blocks, file, origin, provider, env, baseDir);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			if (String(file.getName()).endsWith(".block.js")) {
				env.reserveFlowScriptBlockFile(blocks, file, origin, provider, baseDir);
			}
		});
	}

	function blocksCacheKey(env) {
		var coreBlocksDir = new env.File(env.engineDir(), "blocks");
		var key = [
			"engine", env.canonicalPath(env.engineDir()),
			"core", env.directoryFingerprint(coreBlocksDir)
		];
		var localBlocksDir = env.projectBlocksDir();
		if (localBlocksDir && env.canonicalPath(localBlocksDir) !== env.canonicalPath(coreBlocksDir)) {
			referencedProjectRoots(env).forEach(function (root) {
				var refBlocksDir = referencedBlocksDir(root, env);
				key.push("reference", env.canonicalPath(root), env.directoryFingerprint(refBlocksDir));
			});
			key.push("project", env.canonicalPath(env.projectDir()), env.directoryFingerprint(localBlocksDir));
		}
		return key.join("\n");
	}

	function loadBlocksUncached(env) {
		var blocks = {};
		var coreBlocksDir = new env.File(env.engineDir(), "blocks");
		reserveBlockDir(blocks, coreBlocksDir, "core", env.flowProviderName(env.engineDir(), "lib_flow_engine"), env);
		loadBlockDir(blocks, coreBlocksDir, "core", env.flowProviderName(env.engineDir(), "lib_flow_engine"), env);
		var localBlocksDir = env.projectBlocksDir();
		if (localBlocksDir && env.canonicalPath(localBlocksDir) !== env.canonicalPath(coreBlocksDir)) {
			referencedProjectRoots(env).forEach(function (root) {
				var refBlocksDir = referencedBlocksDir(root, env);
				reserveBlockDir(blocks, refBlocksDir, "reference", projectNameFromRoot(root), env, refBlocksDir);
				loadBlockDir(blocks, refBlocksDir, "reference", projectNameFromRoot(root), env, refBlocksDir);
			});
			reserveBlockDir(blocks, localBlocksDir, "project",
				env.flowProviderName(new env.File(env.projectDir(), "libs/flow"), "project"), env);
			loadBlockDir(blocks, localBlocksDir, "project",
				env.flowProviderName(new env.File(env.projectDir(), "libs/flow"), "project"), env);
		}
		return blocks;
	}

	function loadBlocks(env) {
		var key = blocksCacheKey(env);
		var cached = env.readRuntimeCache(env.blockCache, key, key);
		if (cached) {
			return cached;
		}
		return env.writeRuntimeCache(env.blockCache, key, key, loadBlocksUncached(env),
			"blocks for " + (env.projectDir() ? env.canonicalPath(env.projectDir()) : "no project"));
	}

	function loadTypeDescriptorFile(types, file, origin, env) {
		var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
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

	function loadTypeDir(types, typesDir, origin, env) {
		sortedFiles(typesDir, env).forEach(function (file) {
			if (!file.isFile() || !String(file.getName()).endsWith(".type.yaml")) {
				return;
			}
			loadTypeDescriptorFile(types, file, origin, env);
		});
	}

	function typesCacheKey(env) {
		var coreTypesDir = new env.File(env.engineDir(), "types");
		var key = [
			"engine", env.canonicalPath(env.engineDir()),
			"core", env.directoryFingerprint(coreTypesDir)
		];
		var localTypesDir = env.projectTypesDir();
		if (localTypesDir && env.canonicalPath(localTypesDir) !== env.canonicalPath(coreTypesDir)) {
			key.push("project", env.canonicalPath(env.projectDir()), env.directoryFingerprint(localTypesDir));
		}
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

	return {
		blockIdFromDescriptorFile: blockIdFromDescriptorFile,
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
