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

	// The parents of a project's configuration, weakest first: the configuration of lib_flow_engine, then the
	// configuration of each referenced Flow project in the order of the project references, each preceded by its own
	// parents (depth first, a project already listed is not repeated). Each entry carries its own configuration and,
	// as "cumulative", the merge of its parents and its own: what configParents selects a branch from.
	function parentConfigs(env) {
		var projectRoot = env.projectDir && env.projectDir();
		var cache = env.configDefinitionCache;
		var listKey = "parents-files:" + (projectRoot ? env.canonicalPath(projectRoot) : "none");
		var cached = cache && env.readRuntimeCache ? env.readRuntimeCache(cache, listKey, "files") : null;
		if (cached) {
			var hit = env.readRuntimeCache(cache, "parents:" + listKey, filesFingerprint(cached.files, env));
			if (hit) return hit;
		}
		var files = [];
		var computed = computeParentConfigs(projectRoot, files, env);
		if (cache && env.writeRuntimeCache) {
			env.writeRuntimeCache(cache, listKey, "files", { files: files }, "Flow configuration parents");
			env.writeRuntimeCache(cache, "parents:" + listKey, filesFingerprint(files, env), computed, "Flow configuration parents");
		}
		return computed;
	}

	function filesFingerprint(files, env) {
		return files.map(function (file) { return env.canonicalPath(file) + "=" + env.fileFingerprint(file); }).join("\n");
	}

	function computeParentConfigs(projectRoot, files, env) {
		var engineFile = engineDefinitionFile(env);
		if (engineFile) files.push(engineFile);
		var engineConfig = loadEngineDefinition(env).config;
		var parents = [];
		var byName = Object.create(null);
		function add(name, config, cumulative) {
			if (!name || byName[name]) return;
			byName[name] = { name: name, config: config, cumulative: cumulative };
			parents.push(byName[name]);
		}
		var engineName = env.engineProviderName ? env.engineProviderName() : "lib_flow_engine";
		var base = isConfigObject(engineConfig) ? engineConfig : {};
		add(engineName, base, base);
		var visiting = Object.create(null);
		function visit(root, inherited) {
			if (!root || typeof env.referencedProjectRoots !== "function") return inherited;
			var key = env.canonicalPath(root);
			if (visiting[key]) return inherited;
			visiting[key] = true;
			files.push(new env.File(root, "c8oProject.yaml"));
			var cumulative = inherited;
			env.referencedProjectRoots(root).forEach(function (childRoot) {
				var name = env.projectNameForRoot ? env.projectNameForRoot(childRoot) : String(childRoot.getName());
				if (!name || byName[name]) {
					if (name && byName[name]) cumulative = mergeConfig(cumulative, byName[name].cumulative);
					return;
				}
				var childAncestors = visit(childRoot, base);
				var childEngineFile = new env.File(childRoot, env.sourcePaths.path("engine.yaml"));
				files.push(childEngineFile);
				var definition = readYamlFile(childEngineFile, "version: 1\n", env);
				var own = isConfigObject(definition.config) ? definition.config : {};
				var childCumulative = mergeConfig(childAncestors, own);
				add(name, own, childCumulative);
				cumulative = mergeConfig(cumulative, childCumulative);
			});
			delete visiting[key];
			return cumulative;
		}
		if (projectRoot) visit(projectRoot, base);
		return { list: parents, byName: byName };
	}

	function pathParts(path) {
		return String(path || "").split(".").filter(function (part) { return part !== ""; });
	}

	function valueAt(value, parts) {
		return parts.reduce(function (current, part) {
			return isConfigObject(current) && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined;
		}, value);
	}

	// A copy of value with the branch at parts replaced (or removed when replacement is undefined).
	function withBranch(value, parts, replacement) {
		var copy = mergeConfig({}, value);
		var target = copy;
		for (var i = 0; i < parts.length - 1; i++) {
			target[parts[i]] = isConfigObject(target[parts[i]]) ? mergeConfig({}, target[parts[i]]) : {};
			target = target[parts[i]];
		}
		if (replacement === undefined) delete target[parts[parts.length - 1]];
		else target[parts[parts.length - 1]] = replacement;
		return copy;
	}

	// configParents: { "email.smtp": "lib_flow_engine" } takes that branch from the named parent, whatever the order of
	// the references (the C++ Base::member of the configuration).
	function selectedParents(projectEngine) {
		var selection = projectEngine && projectEngine.configParents;
		if (selection === undefined || selection === null) return [];
		if (!isConfigObject(selection)) {
			configError("FLOW_CONFIG_PARENTS_OBJECT_REQUIRED", "configParents must map config branches to parent project names.");
		}
		return Object.keys(selection).map(function (branch) {
			var parent = selection[branch];
			if (typeof parent !== "string" || !pathParts(branch).length) {
				configError("FLOW_CONFIG_PARENT_INVALID", "configParents." + branch + " must name a parent project.");
			}
			return { branch: branch, parent: parent };
		});
	}

	// The inherited configuration: the parents merged in order, then the branches configParents selects.
	function inheritedConfig(projectEngine, env, parents) {
		parents = parents || parentConfigs(env);
		var merged = {};
		parents.list.forEach(function (parent) { merged = mergeConfig(merged, parent.config); });
		selectedParents(projectEngine).forEach(function (selection) {
			var parent = parents.byName[selection.parent];
			if (!parent) {
				configError("FLOW_CONFIG_PARENT_UNKNOWN", "configParents." + selection.branch + " names " + selection.parent
					+ ", which is not a parent of this project: reference that project, or choose one of "
					+ parents.list.map(function (item) { return item.name; }).join(", ") + ".");
			}
			var parts = pathParts(selection.branch);
			var value = valueAt(parent.cumulative, parts);
			merged = withBranch(merged, parts, value === undefined ? undefined : mergeConfig({}, { v: value }).v);
		});
		return merged;
	}

	function checkedLayer(layer) {
		if (layer !== undefined && (!layer || Object.prototype.toString.call(layer) !== "[object Object]")) {
			var error = new Error("Flow configuration must be an object of literal defaults.");
			error.code = "FLOW_CONFIG_OBJECT_REQUIRED";
			throw error;
		}
		return layer;
	}

	// The configuration of a Flow, weakest first, merged value by value (objects merge, any other value replaces):
	// the defaults of the Flow, the inherited configuration of the parents, the project configuration (default then
	// the named configurations of its tags), the configuration of the project the HTTP request targets when it is
	// another project (it wins for the values it sets itself: a library takes the settings of each application that
	// uses it), then the configuration given by the call.
	function effectiveConfig(request, definition, projectEngine, env) {
		var meta = definition && definition.flow || {};
		var merged = {};
		var requestRoot = env.requestRootLayer ? env.requestRootLayer(request) : undefined;
		[checkedLayer(meta.config), inheritedConfig(projectEngine, env), checkedLayer(projectConfig(request, projectEngine, env)),
			checkedLayer(requestRoot && requestRoot.config), checkedLayer(request && request.config)].forEach(function (layer) {
			if (layer !== undefined) merged = mergeConfig(merged, layer);
		});
		var config = Object.create(null);
		Object.keys(merged).forEach(function (key) { config[key] = env.normalizeTree(merged[key]); });
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

	function resolveConfigSymbols(value, env) {
		if (typeof value === "string") {
			return value.indexOf("${") === -1 || typeof env.compileSymbols !== "function" ? value : env.compileSymbols(value);
		}
		var array = Array.isArray(value);
		if (!array && !isConfigObject(value)) {
			return value;
		}
		var keys = Object.keys(value), copy = null;
		keys.forEach(function (key, index) {
			var resolved = resolveConfigSymbols(value[key], env);
			if (resolved !== value[key] && copy === null) {
				copy = array ? value.slice() : Object.create(Object.getPrototypeOf(value));
				if (!array) {
					keys.slice(0, index).forEach(function (previous) { define(copy, previous, value[previous]); });
				}
			}
			if (copy !== null) {
				define(copy, key, resolved);
			}
		});
		return copy === null ? value : copy;
	}

	function define(target, key, value) {
		Object.defineProperty(target, key, { value: value, enumerable: true, writable: true, configurable: true });
	}

	// The configuration a running Flow reads: the effective configuration with its symbols resolved.
	function runtimeConfig(request, definition, projectEngine, env) {
		return resolveConfigSymbols(effectiveConfig(request, definition, projectEngine, env), env);
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

	// The configuration the runtime gives a Flow, with the origin of each value (leaf path -> origin), layer by layer
	// as effectiveConfig merges them.
	function effectiveConfigTrace(request, definition, projectEngine, env) {
		var meta = definition && definition.flow || {};
		var sources = Object.create(null);
		function forget(path) {
			Object.keys(sources).forEach(function (key) { if (key === path || key.indexOf(path + ".") === 0) delete sources[key]; });
		}
		function mark(value, path, origin) {
			if (isConfigObject(value) && Object.keys(value).length) {
				Object.keys(value).forEach(function (key) { mark(value[key], path ? path + "." + key : key, origin); });
			} else { forget(path); sources[path] = origin; }
		}
		// A layer merged over the previous ones: an object value merges, any other value replaces the whole branch.
		function layer(value, origin) {
			if (!isConfigObject(value)) return;
			Object.keys(value).forEach(function (key) { mergeMark(value[key], key, origin); });
		}
		function mergeMark(value, path, origin) {
			if (isConfigObject(value) && Object.keys(value).length) {
				Object.keys(sources).forEach(function (key) { if (key === path) delete sources[key]; });
				Object.keys(value).forEach(function (key) { mergeMark(value[key], path + "." + key, origin); });
			} else mark(value, path, origin);
		}
		var config = effectiveConfig(request, definition, projectEngine, env);
		layer(meta.config, "Flow default");
		var parents = parentConfigs(env);
		parents.list.forEach(function (parent) { layer(parent.config, "parent " + parent.name); });
		selectedParents(projectEngine).forEach(function (selection) {
			var parent = parents.byName[selection.parent];
			if (!parent) return;
			var parts = pathParts(selection.branch);
			forget(selection.branch);
			mark(valueAt(parent.cumulative, parts), selection.branch, "parent " + parent.name + " (configParents)");
		});
		var common = projectEngine && projectEngine.config;
		layer(isConfigObject(common) ? common : {}, "default");
		var definitions = configurationDefinitions(projectEngine);
		taggedReferences(request, projectEngine).forEach(function (reference) {
			layer(definitions[reference.name], reference.name + " (tag " + reference.tag + ")");
		});
		var requestRoot = env.requestRootLayer ? env.requestRootLayer(request) : undefined;
		if (requestRoot) layer(requestRoot.config, "request project " + requestRoot.project);
		layer(request && request.config, "call");
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
		resolveConfigSymbols: resolveConfigSymbols,
		runtimeConfig: runtimeConfig,
		configurationDefinitions: configurationDefinitions,
		tagContribution: tagContribution,
		validateReferencedConfigurations: validateReferencedConfigurations,
		resolveTaggedConfig: resolveTaggedConfig,
		effectiveConfigTrace: effectiveConfigTrace,
		parentConfigs: parentConfigs,
		projectConfig: projectConfig,
		taggedReferences: taggedReferences,
		inheritedConfig: inheritedConfig,
		resolveConfigReferences: resolveConfigReferences
	};
})();
