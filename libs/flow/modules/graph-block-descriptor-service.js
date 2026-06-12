(function () {
	function normalizeProps(definition, env) {
		var props = definition.props || definition.properties || {};
		if (Object.prototype.toString.call(props) === "[object Array]") {
			var out = {};
			props.forEach(function (prop) {
				if (prop && prop.name) {
					var copy = env.normalizeTree(prop);
					delete copy.name;
					out[String(prop.name)] = copy;
				}
			});
			return out;
		}
		return env.normalizeTree(props || {});
	}

	function normalizeSlots(definition, env) {
		var slots = definition.slots || definition.children;
		if (!slots) {
			return [];
		}
		if (Object.prototype.toString.call(slots) === "[object Array]") {
			return slots.map(function (slot) {
				if (slot && typeof slot === "object") {
					return env.normalizeTree(slot);
				}
				return { name: String(slot), label: String(slot) };
			}).filter(function (slot) {
				return slot.name;
			});
		}
		if (typeof slots === "object") {
			return Object.keys(slots).map(function (name) {
				var slot = slots[name];
				if (slot && typeof slot === "object") {
					slot = env.normalizeTree(slot);
					if (!slot.name) {
						slot.name = name;
					}
					return slot;
				}
				return { name: name, label: String(slot || name) };
			});
		}
		return [];
	}

	function normalizeUses(definition, env) {
		var uses = definition.uses || definition.libraries || [];
		if (typeof uses === "string") {
			uses = uses.split(",");
		}
		if (typeof uses === "object" && Object.prototype.toString.call(uses) !== "[object Array]") {
			uses = Object.keys(uses).map(function (key) {
				var value = uses[key];
				if (value && typeof value === "object" && value.name) {
					return value.name;
				}
				return key;
			});
		}
		var out = [];
		(uses || []).forEach(function (use) {
			use = env.safeFilePart(use);
			if (use && out.indexOf(use) === -1) {
				out.push(use);
			}
		});
		return out;
	}

	function implementation(definition, env) {
		var config = definition.implementation || {};
		if (typeof config === "string") {
			config = { runtime: config };
		}
		config = env.normalizeTree(config || {});
		var runtime = String(config.runtime || config.kind || "").trim();
		if (!runtime) {
			runtime = definition.nodes ? "flow" : "rhino";
		}
		config.runtime = runtime;
		return config;
	}

	function catalog(definition, env) {
		var props = normalizeProps(definition, env);
		var slots = normalizeSlots(definition, env);
		var uses = normalizeUses(definition, env);
		var config = implementation(definition, env);
		var blockId = String(definition.__flowBlockId || definition.blockId || definition.name || "");
		var namespace = env.blockNamespace(blockId);
		var localName = env.blockLocalName(blockId);
		var descriptor = {
			blockId: blockId,
			name: localName || blockId,
			localName: localName || blockId,
			namespace: namespace,
			icon: definition.icon || "mdi:puzzle-outline",
			tags: definition.tags || (definition.kind ? [String(definition.kind)] : []),
			implementation: config.runtime,
			runtime: config.runtime,
			props: props,
			outputs: env.normalizeTree(definition.outputs || definition.output || {}),
			description: definition.description || "Composite Flow block implemented with child nodes.",
			longDescription: definition.longDescription || definition.documentation || ""
		};
		if (config.file) {
			descriptor.implementationFile = config.file;
		}
		if (slots.length > 0) {
			descriptor.slots = slots;
		}
		if (uses.length > 0) {
			descriptor.uses = uses;
		}
		["private", "visibility", "label", "display", "hooks", "additionalProperties", "dynamicProperties"].forEach(function (key) {
			if (definition[key] !== undefined) {
				descriptor[key] = definition[key];
			}
		});
		return descriptor;
	}

	function validateDefinition(name, definition, env) {
		definition = env.normalizeTree(definition || {});
		name = String(name || "");
		if (!name) {
			env.raise("INVALID_GRAPH_BLOCK", "Composite block name is required.");
		}
		if (definition.name && String(definition.name) !== name && String(definition.name) !== env.blockLocalName(name)) {
			env.raise("BLOCK_NAME_MISMATCH", "Composite block source declares \"" + definition.name + "\" instead of \"" + name + "\".");
		}
		definition.__flowBlockId = name;
		definition.name = env.blockLocalName(name) || name;
		definition.namespace = env.blockNamespace(name);
		var config = implementation(definition, env);
		if (config.runtime === "flow" && definition.nodes !== undefined) {
			env.raise("INVALID_GRAPH_BLOCK", "Flow block \"" + name + "\" must move nodes to implementation.file.",
				null, "Use canonical *.block.js with _meta plus a FlowScript function for editable Flow block source.");
		}
		if (config.runtime === "flow" && !config.file && !definition.__graphDefinition) {
			env.raise("INVALID_GRAPH_BLOCK", "Flow block \"" + name + "\" must define implementation.file.");
		}
		if (config.runtime === "rhino" && !config.file && definition.__rhinoCode === undefined) {
			env.raise("INVALID_GRAPH_BLOCK", "Rhino block \"" + name + "\" must define implementation.file.");
		}
		normalizeProps(definition, env);
		return definition;
	}

	function validateSource(name, source, env) {
		return validateDefinition(name, env.parseYamlSource(source, "version: 1\nnodes: []\n"), env);
	}

	function definitionForWrite(definition, env) {
		var out = env.normalizeTree(definition || {});
		delete out.__flowBlockId;
		delete out.blockId;
		delete out.localName;
		delete out.provider;
		delete out.namespace;
		delete out.__rhinoCode;
		delete out.__flowCode;
		delete out.__graphDefinition;
		delete out["package"];
		if (out.kind !== undefined) {
			if (out.tags === undefined || out.tags === null) {
				out.tags = [String(out.kind)];
			}
			delete out.kind;
		}
		if (out.name !== undefined && out.name !== null && String(out.name) !== "") {
			delete out.name;
		}
		return out;
	}

	return {
		normalizeProps: normalizeProps,
		normalizeSlots: normalizeSlots,
		normalizeUses: normalizeUses,
		implementation: implementation,
		catalog: catalog,
		validateDefinition: validateDefinition,
		validateSource: validateSource,
		definitionForWrite: definitionForWrite
	};
}())
