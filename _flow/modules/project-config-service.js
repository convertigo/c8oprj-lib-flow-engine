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
		return dir ? new env.File(dir, env.sourcePaths.path("engine.yaml")) : null;
	}

	function engineDefinitionFile(env) {
		var dir = env.engineDir && env.engineDir();
		return dir ? new env.File(dir, "engine.yaml") : null;
	}

	function readYamlFile(file, fallback, env) {
		var cache = env.configDefinitionCache;
		var key = file ? env.canonicalPath(file) : "missing";
		var fingerprint = file ? env.fileFingerprint(file) : "missing";
		if (env.sources) fingerprint += "\n" + env.sources.fingerprint();
		if (cache && env.readRuntimeCache) {
			var cached = env.readRuntimeCache(cache, key, fingerprint);
			if (cached) {
				return cached;
			}
		}
		var definition = !file || !(env.sources ? env.sources.isFile(file) : file.isFile())
			? {}
			: env.parseYamlSource(env.sources ? env.sources.read(file) : env.FileUtils.readFileToString(file, "UTF-8"), fallback || "version: 1\n");
		return cache && env.writeRuntimeCache
			? env.writeRuntimeCache(cache, key, fingerprint, definition, "Flow engine configuration")
			: definition;
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
		var config = Object.create(null);
		var meta = definition && definition.flow || {};
		// Flow defaults, the project configuration and the call config replace each other by root branch (deep merging
		// stays explicit in config.use). Inside the project configuration, the named configurations selected by the
		// tags merge over default, value by value, in tag order: the last one wins.
		[meta.config, projectConfig(request, projectEngine, env), request && request.config].forEach(function (layer) {
			if (layer === undefined) return;
			if (!layer || Object.prototype.toString.call(layer) !== "[object Object]") {
				var error = new Error("Flow configuration must be an object of literal defaults.");
				error.code = "FLOW_CONFIG_OBJECT_REQUIRED";
				throw error;
			}
			Object.keys(layer).forEach(function (key) {
				config[key] = layer[key];
			});
		});
		// Clone only the winning root values, not branches discarded by overrides.
		Object.keys(config).forEach(function (key) { config[key] = env.normalizeTree(config[key]); });
		var keys = env.collectConfigKeys(definition);
		["bindings", "binding"].forEach(function (key) {
			if (keys.indexOf(key) === -1) {
				keys.push(key);
			}
		});
		keys.forEach(function (key) {
			if (Object.prototype.hasOwnProperty.call(config, key)) {
				return;
			}
			var value = readGlobalValue(key, env);
			if (value !== undefined) {
				config[key] = value;
			}
		});
		return config;
	}

	function configError(code, message) {
		var error = new Error(message);
		error.code = code;
		throw error;
	}

	function isConfigObject(value) {
		return !!value && typeof value === "object" && Object.prototype.toString.call(value) === "[object Object]";
	}

	// Value by value: objects merge, any other value (array and null included) replaces the previous one.
	// It builds new objects only: definitions come from shared caches and are never mutated.
	function mergeConfig(base, overlay) {
		var merged = {};
		[base, overlay].forEach(function (layer, index) {
			Object.keys(layer || {}).forEach(function (key) {
				if (key === "__proto__") return;
				var value = layer[key];
				merged[key] = index && isConfigObject(value) && isConfigObject(merged[key]) ? mergeConfig(merged[key], value) : value;
			});
		});
		return merged;
	}

	// The project configuration of a Flow: default, then the named configurations of its tags merged over it.
	function projectConfig(request, projectEngine, env) {
		var common = projectEngine && projectEngine.config;
		var tagged = resolveTaggedConfig(request, projectEngine, env);
		// A malformed default stays reported by effectiveConfig.
		if (!Object.keys(tagged).length || common !== undefined && !isConfigObject(common)) return common;
		return mergeConfig(common, tagged);
	}

	// The configuration the runtime gives a Flow, with the origin of each value (leaf path -> origin).
	function effectiveConfigTrace(request, definition, projectEngine, env) {
		var meta = definition && definition.flow || {};
		var sources = Object.create(null), projectSources = Object.create(null);
		function forget(map, path) {
			Object.keys(map).forEach(function (key) { if (key === path || key.indexOf(path + ".") === 0) delete map[key]; });
		}
		function mark(map, value, path, origin) {
			if (isConfigObject(value) && Object.keys(value).length) {
				Object.keys(value).forEach(function (key) { mark(map, value[key], path + "." + key, origin); });
			} else map[path] = origin;
		}
		function mergeMark(current, value, path, origin) {
			if (isConfigObject(value) && isConfigObject(current)) {
				Object.keys(value).forEach(function (key) { mergeMark(current[key], value[key], path + "." + key, origin); });
			} else { forget(projectSources, path); mark(projectSources, value, path, origin); }
		}
		function replaceRoots(layer, origin, layerSources) {
			if (!isConfigObject(layer)) return;
			Object.keys(layer).forEach(function (key) {
				forget(sources, key);
				if (!layerSources) { mark(sources, layer[key], key, origin); return; }
				Object.keys(layerSources).forEach(function (path) {
					if (path === key || path.indexOf(key + ".") === 0) sources[path] = layerSources[path];
				});
			});
		}
		var config = effectiveConfig(request, definition, projectEngine, env);
		var common = projectEngine && projectEngine.config, project = isConfigObject(common) ? common : {};
		Object.keys(project).forEach(function (key) { mark(projectSources, project[key], key, "default"); });
		var definitions = configurationDefinitions(projectEngine);
		taggedReferences(request, projectEngine).forEach(function (reference) {
			var value = definitions[reference.name];
			Object.keys(value).forEach(function (key) {
				mergeMark(project[key], value[key], key, reference.name + " (tag " + reference.tag + ")");
			});
			project = mergeConfig(project, value);
		});
		replaceRoots(meta.config, "Flow default");
		replaceRoots(project, null, projectSources);
		replaceRoots(request && request.config, "call");
		return { config: config, sources: sources, visibility: projectEngine && projectEngine.configVisibility || {} };
	}

	function configurationDefinitions(projectEngine) {
		var definitions = projectEngine && projectEngine.configs;
		if (definitions === undefined) return Object.create(null);
		if (!definitions || Object.prototype.toString.call(definitions) !== "[object Object]") {
			configError("FLOW_CONFIG_DEFINITIONS_OBJECT_REQUIRED", "Named project configurations must be an object.");
		}
		Object.keys(definitions).forEach(function (name) {
			var value = definitions[name];
			if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
				configError("FLOW_CONFIG_DEFINITION_OBJECT_REQUIRED", "Named configuration " + name + " must be an object of config branches.");
			}
		});
		return definitions;
	}

	function tagContribution(projectEngine) {
		return {
			label: "Flow configurations",
			fields: {
				configs: {
					label: "Named configurations",
					description: "Merged over the default configuration from top to bottom, value by value: for a value set several times, the last configuration wins. The tags of a sequence apply in their order, so the last tag wins over the previous ones. Values stay in the Flow engine.",
					type: "array", uniqueItems: true,
					items: { type: "string", enum: Object.keys(configurationDefinitions(projectEngine)).sort() }
				}
			}
		};
	}

	// Only what a mutation breaks is refused: a referenced configuration it removes or renames, or a new configuration
	// named default. An older broken reference (after a pull) stays visible in the tag manager instead of blocking edits.
	function validateReferencedConfigurations(projectEngine, tagContext, namesBefore) {
		var definitions = configurationDefinitions(projectEngine);
		var had = function (name) { return !namesBefore || Object.prototype.hasOwnProperty.call(namesBefore, name); };
		if (Object.prototype.hasOwnProperty.call(definitions, "default") && !(namesBefore && had("default"))) {
			configError("FLOW_CONFIG_NAME_RESERVED", "default is the common configuration of the project: give this named configuration another name.");
		}
		var tags = tagContext && tagContext.tags || {};
		Object.keys(tags).forEach(function (id) {
			var tag = tags[id], references = tag.metadata && tag.metadata.flow && tag.metadata.flow.configs;
			if (Object.prototype.toString.call(references) !== "[object Array]") return;
			references.forEach(function (name) {
				if (typeof name !== "string" || Object.prototype.hasOwnProperty.call(definitions, name) || !had(name)) return;
				configError("FLOW_CONFIG_IN_USE", "Configuration " + name + " is referenced by tag " + String(tag.label || id)
					+ ". Update that tag's configuration references before removing or renaming the definition.");
			});
		});
		return definitions;
	}

	// The ordered named configurations a Flow's tags select, each with the label of the tag that selects it.
	function taggedReferences(request, projectEngine) {
		var context = request && request.tagContext;
		if (!context) return [];
		if (context.diagnostic) {
			// The tag source cannot be read, so memberships are unknown. A project without named configurations does not
			// depend on them; with some, picking none would silently run on another configuration.
			if (Object.keys(configurationDefinitions(projectEngine)).length) {
				configError("FLOW_TAGS_UNAVAILABLE", "The tags of project " + String(context.project || "") + " cannot be read ("
					+ String(context.diagnostic) + "): its named configurations cannot be selected until its tag source is fixed.");
			}
			return [];
		}
		var target = String(request.flowQName || request.qname || "");
		if (!target) {
			var name = request.flowName || request.name;
			if (name) target = String(request.project || context.project || "") + "." + String(name);
		}
		if (context.aliases && Object.prototype.hasOwnProperty.call(context.aliases, target)) target = context.aliases[target];
		var assignments = context.assignments || {};
		var tags = context.tags || {};
		var ids = Object.prototype.hasOwnProperty.call(assignments, target) ? assignments[target] : [];
		if (Object.prototype.toString.call(ids) !== "[object Array]") {
			configError("FLOW_TAG_ASSIGNMENTS_ARRAY_REQUIRED", "Tag membership must be an ordered list.");
		}
		var references = [];
		ids.forEach(function (id) {
			if (!Object.prototype.hasOwnProperty.call(tags, id)) configError("FLOW_TAG_REFERENCE_NOT_FOUND", "Unknown assigned tag: " + id);
			var metadata = tags[id].metadata;
			var selected = metadata && metadata.flow && metadata.flow.configs;
			if (selected === undefined) return;
			if (Object.prototype.toString.call(selected) !== "[object Array]") {
				configError("FLOW_CONFIG_REFERENCES_ARRAY_REQUIRED", "Tag configuration references must be an ordered list of names.");
			}
			selected.forEach(function (reference) { references.push({ name: reference, tag: String(tags[id].label || id) }); });
		});
		return references;
	}

	function resolveTaggedConfig(request, projectEngine, env) {
		return resolveConfigReferences(projectEngine, taggedReferences(request, projectEngine).map(function (reference) {
			return reference.name;
		}), env);
	}

	// Reference order is source data, never the presentation order of tags: they merge value by value, the last one winning.
	function resolveConfigReferences(projectEngine, references, env) {
		if (Object.prototype.toString.call(references) !== "[object Array]") {
			configError("FLOW_CONFIG_REFERENCES_ARRAY_REQUIRED", "Configuration references must be an ordered list of names.");
		}
		var definitions = configurationDefinitions(projectEngine);
		var config = Object.create(null);
		references.forEach(function (name) {
			if (typeof name !== "string" || !name || !Object.prototype.hasOwnProperty.call(definitions, name)) {
				configError("FLOW_CONFIG_REFERENCE_NOT_FOUND", "Unknown named configuration: " + String(name));
			}
			config = mergeConfig(config, definitions[name]);
		});
		Object.keys(config).forEach(function (key) { config[key] = env.normalizeTree(config[key]); });
		return config;
	}

	return {
		readGlobalValue: readGlobalValue,
		projectEngineFile: projectEngineFile,
		loadEngineDefinition: loadEngineDefinition,
		loadProjectEngineDefinition: loadProjectEngineDefinition,
		authoringSettings: authoringSettings,
		authoringNumber: authoringNumber,
		effectiveConfig: effectiveConfig,
		configurationDefinitions: configurationDefinitions,
		tagContribution: tagContribution,
		validateReferencedConfigurations: validateReferencedConfigurations,
		resolveTaggedConfig: resolveTaggedConfig,
		effectiveConfigTrace: effectiveConfigTrace,
		resolveConfigReferences: resolveConfigReferences
	};
})();
