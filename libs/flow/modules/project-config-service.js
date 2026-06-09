(function () {
	function readGlobalValue(name, env) {
		if (!env.globalScope || name === undefined || name === null || name === "") {
			return undefined;
		}
		var value = env.globalScope[String(name)];
		return typeof value === "undefined" ? undefined : env.jsValue(value);
	}

	function projectEngineFile(env) {
		var dir = env.projectDir();
		return dir ? new env.File(dir, "libs/flow/engine.yaml") : null;
	}

	function loadProjectEngineDefinition(env) {
		var file = projectEngineFile(env);
		if (!file || !file.isFile()) {
			return {};
		}
		return env.parseYamlSource(env.FileUtils.readFileToString(file, "UTF-8"), "version: 1\n");
	}

	function effectiveConfig(request, definition, projectEngine, env) {
		var config = {};
		Object.keys(projectEngine && projectEngine.config || {}).forEach(function (key) {
			config[key] = env.normalizeTree(projectEngine.config[key]);
		});
		Object.keys(request.config || {}).forEach(function (key) {
			config[key] = env.normalizeTree(request.config[key]);
		});
		var keys = env.collectConfigKeys(definition);
		["bindings", "binding"].forEach(function (key) {
			if (keys.indexOf(key) === -1) {
				keys.push(key);
			}
		});
		keys.forEach(function (key) {
			if (config[key] !== undefined && config[key] !== null) {
				return;
			}
			var value = readGlobalValue(key, env);
			if (value !== undefined) {
				config[key] = value;
			}
		});
		return config;
	}

	return {
		readGlobalValue: readGlobalValue,
		projectEngineFile: projectEngineFile,
		loadProjectEngineDefinition: loadProjectEngineDefinition,
		effectiveConfig: effectiveConfig
	};
})();
