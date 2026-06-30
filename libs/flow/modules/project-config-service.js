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

	function engineDefinitionFile(env) {
		var dir = env.engineDir && env.engineDir();
		return dir ? new env.File(dir, "engine.yaml") : null;
	}

	function readYamlFile(file, fallback, env) {
		if (!file || !file.isFile()) {
			return {};
		}
		return env.parseYamlSource(env.FileUtils.readFileToString(file, "UTF-8"), fallback || "version: 1\n");
	}

	function loadProjectEngineDefinition(env) {
		return readYamlFile(projectEngineFile(env), "version: 1\n", env);
	}

	function loadEngineDefinition(env) {
		return readYamlFile(engineDefinitionFile(env), "version: 1\n", env);
	}

	function mergeObject(target, source) {
		Object.keys(source || {}).forEach(function (key) {
			var value = source[key];
			if (value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]") {
				if (!target[key] || typeof target[key] !== "object" || Object.prototype.toString.call(target[key]) === "[object Array]") {
					target[key] = {};
				}
				mergeObject(target[key], value);
			} else {
				target[key] = value;
			}
		});
		return target;
	}

	function authoringSettings(env) {
		var settings = {};
		mergeObject(settings, loadEngineDefinition(env).authoring || {});
		mergeObject(settings, loadProjectEngineDefinition(env).authoring || {});
		return env.normalizeTree(settings);
	}

	function pathValue(value, path) {
		return String(path || "").split(".").reduce(function (current, part) {
			return current && current[part] !== undefined ? current[part] : undefined;
		}, value);
	}

	function authoringNumber(path, fallback, min, max, env) {
		var value = pathValue(authoringSettings(env), path);
		if (value === undefined || value === null || value === "") {
			return fallback;
		}
		var number = parseInt(String(value), 10);
		if (isNaN(number)) {
			return fallback;
		}
		if (min !== undefined && number < min) {
			return min;
		}
		if (max !== undefined && number > max) {
			return max;
		}
		return number;
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
		loadEngineDefinition: loadEngineDefinition,
		loadProjectEngineDefinition: loadProjectEngineDefinition,
		authoringSettings: authoringSettings,
		authoringNumber: authoringNumber,
		effectiveConfig: effectiveConfig
	};
})();
