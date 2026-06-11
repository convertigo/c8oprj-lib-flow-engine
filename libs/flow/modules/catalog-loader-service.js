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

	function loadBlockDir(blocks, blocksDir, origin, provider, env) {
		sortedFiles(blocksDir, env).forEach(function (file) {
			if (file.isDirectory()) {
				loadBlockDir(blocks, file, origin, provider, env);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var base = blocksBaseDir(origin, env);
			if (String(file.getName()).endsWith(".block.js")) {
				env.loadFlowScriptBlockFile(blocks, file, origin, provider, base);
			}
		});
	}

	function reserveBlockDir(blocks, blocksDir, origin, provider, env) {
		sortedFiles(blocksDir, env).forEach(function (file) {
			if (file.isDirectory()) {
				reserveBlockDir(blocks, file, origin, provider, env);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var base = blocksBaseDir(origin, env);
			if (String(file.getName()).endsWith(".block.js")) {
				env.reserveFlowScriptBlockFile(blocks, file, origin, provider, base);
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
			reserveBlockDir(blocks, localBlocksDir, "project",
				env.flowProviderName(new env.File(env.projectDir(), "libs/flow"), "project"), env);
			loadBlockDir(blocks, localBlocksDir, "project",
				env.flowProviderName(new env.File(env.projectDir(), "libs/flow"), "project"), env);
		}
		return blocks;
	}

	function loadBlocks(env) {
		var key = blocksCacheKey(env);
		var cached = env.readRuntimeCache(env.blockCache, key);
		if (cached) {
			return cached;
		}
		return env.writeRuntimeCache(env.blockCache, key, loadBlocksUncached(env),
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
		var cached = env.readRuntimeCache(env.typeCache, key);
		if (cached) {
			return cached;
		}
		return env.writeRuntimeCache(env.typeCache, key, loadTypesUncached(env),
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
