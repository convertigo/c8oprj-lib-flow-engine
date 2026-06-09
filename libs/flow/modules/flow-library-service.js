(function () {
	function providerName(flowDir, fallback, env) {
		try {
			var dir = new env.File(flowDir);
			var project = dir.getParentFile() ? dir.getParentFile().getParentFile() : null;
			var name = project ? String(project.getName() || "") : "";
			return name || fallback || "unknown";
		} catch (e) {
			return fallback || "unknown";
		}
	}

	function projectRootFromFlowDir(flowDir, env) {
		var dir = new env.File(flowDir);
		return dir.getParentFile() ? dir.getParentFile().getParentFile() : null;
	}

	function libraryFile(name, env) {
		name = env.safeFilePart(name);
		if (!name) {
			env.raise("MISSING_LIBRARY_NAME", "Flow library name is required.");
		}
		var localDir = env.projectLibDir();
		if (localDir) {
			var localFile = new env.File(localDir, name + ".js");
			if (localFile.isFile()) {
				return localFile;
			}
		}
		var engineFile = new env.File(env.engineLibDir(), name + ".js");
		if (engineFile.isFile()) {
			return engineFile;
		}
		env.raise("UNKNOWN_LIBRARY", "Unknown Flow library: " + name,
			null, "Create libs/flow/lib/" + name + ".js in the project or engine.");
	}

	function collectLibraries(out, dir, origin, provider, env) {
		var files = dir && dir.listFiles();
		if (!files) {
			return;
		}
		files = env.Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (!file.isFile() || !String(file.getName()).endsWith(".js")) {
				return;
			}
			var name = String(file.getName());
			name = name.substring(0, name.length - 3);
			out[name] = {
				name: name,
				provider: provider,
				origin: origin,
				file: String(file.getAbsolutePath()),
				description: "Flow JavaScript library loaded with ctx.lib(\"" + name + "\")."
			};
		});
	}

	function list(env) {
		var libraries = {};
		collectLibraries(libraries, env.engineLibDir(), "core", providerName(env.engineDir(), "lib_flow_engine", env), env);
		var localDir = env.projectLibDir();
		if (localDir && env.canonicalPath(localDir) !== env.canonicalPath(env.engineLibDir())) {
			collectLibraries(libraries, localDir, "project",
				providerName(new env.File(env.projectDir(), "libs/flow"), "project", env), env);
		}
		return Object.keys(libraries).sort().map(function (name) {
			return libraries[name];
		});
	}

	function load(name, env) {
		var file = libraryFile(name, env);
		var cache = env.cache;
		var key = env.canonicalPath(file);
		var fingerprint = env.fileFingerprint(file);
		var cached = env.readRuntimeMapCache(cache, key, fingerprint);
		if (cached) {
			return cached;
		}
		var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
		var library = eval(source);
		if (!library || typeof library !== "object") {
			env.raise("INVALID_LIBRARY", "Invalid Flow library: " + file.getAbsolutePath(),
				null, "A Flow library must evaluate to an object.");
		}
		library.__flowFile = String(file.getAbsolutePath());
		return env.writeRuntimeMapCache(cache, key, fingerprint, library, "Flow JavaScript libraries");
	}

	return {
		providerName: providerName,
		projectRootFromFlowDir: projectRootFromFlowDir,
		libraryFile: libraryFile,
		list: list,
		load: load
	};
}())
