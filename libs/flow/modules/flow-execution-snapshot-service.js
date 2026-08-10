(function () {
	var FORMAT = "convertigo.flow.execution-snapshot";
	var VERSION = 1;

	function invalid(message, path) {
		var error = new Error(message);
		error.code = "INVALID_FLOW_EXECUTION_SNAPSHOT";
		error.path = String(path || "");
		throw error;
	}

	function neutralClone(value, path, seen) {
		path = path || "$";
		seen = seen || [];
		if (value === null || typeof value === "string" || typeof value === "boolean") {
			return value;
		}
		if (typeof value === "number") {
			if (!isFinite(value)) {
				invalid("Flow execution snapshots cannot contain non-finite numbers.", path);
			}
			return value;
		}
		if (typeof value === "undefined" || typeof value === "function") {
			invalid("Flow execution snapshots can contain only JSON-compatible values.", path);
		}
		if (typeof value !== "object") {
			invalid("Unsupported Flow execution snapshot value.", path);
		}
		if (seen.indexOf(value) !== -1) {
			invalid("Flow execution snapshots cannot contain cycles.", path);
		}
		seen.push(value);
		var out;
		if (Object.prototype.toString.call(value) === "[object Array]") {
			out = value.map(function (item, index) {
				return neutralClone(item, path + "[" + index + "]", seen);
			});
		} else if (Object.prototype.toString.call(value) === "[object Object]") {
			out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = neutralClone(value[key], path + "." + key, seen);
			});
		} else {
			invalid("Flow execution snapshots cannot contain host or runtime objects.", path);
		}
		seen.pop();
		return out;
	}

	function deepFreeze(value) {
		if (!value || typeof value !== "object" || typeof Object.freeze !== "function" || Object.isFrozen(value)) {
			return value;
		}
		Object.keys(value).forEach(function (key) {
			deepFreeze(value[key]);
		});
		return Object.freeze(value);
	}

	function collectBlockNames(definition, blockName) {
		var names = {};
		function visit(value) {
			if (!value || typeof value !== "object") {
				return;
			}
			if (Object.prototype.toString.call(value) === "[object Array]") {
				value.forEach(visit);
				return;
			}
			var name = String(blockName(value) || "");
			if (name) {
				names[name] = true;
			}
			Object.keys(value).forEach(function (key) {
				if (key !== "props") {
					visit(value[key]);
				}
			});
		}
		visit(definition && definition.nodes || []);
		return Object.keys(names).sort();
	}

	function utf8Bytes(text) {
		text = String(text || "");
		var bytes = 0;
		for (var i = 0; i < text.length; i++) {
			var code = text.charCodeAt(i);
			if (code < 0x80) {
				bytes += 1;
			} else if (code < 0x800) {
				bytes += 2;
			} else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
				text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
				bytes += 4;
				i++;
			} else {
				bytes += 3;
			}
		}
		return bytes;
	}

	function validate(snapshot) {
		if (!snapshot || snapshot.format !== FORMAT || Number(snapshot.version) !== VERSION) {
			invalid("Unsupported Flow execution snapshot format.", "$" );
		}
		if (!snapshot.definition || typeof snapshot.definition !== "object") {
			invalid("Flow execution snapshot has no definition.", "$.definition");
		}
		return snapshot;
	}

	function create(args, env) {
		args = args || {};
		env = env || {};
		var blockName = env.blockName || function (node) { return node && (node.block || node.type) || ""; };
		var definition = neutralClone(args.definition || { version: 1, nodes: [] }, "$.definition");
		var snapshot = {
			format: FORMAT,
			version: VERSION,
			flowQName: String(args.flowQName || ""),
			sourceHash: String(args.sourceHash || ""),
			compilerFingerprint: String(args.compilerFingerprint || ""),
			blockNames: collectBlockNames(definition, blockName),
			definition: definition
		};
		var payload = JSON.stringify(snapshot);
		snapshot.payloadBytes = utf8Bytes(payload);
		return deepFreeze(snapshot);
	}

	function serialize(snapshot) {
		validate(snapshot);
		return JSON.stringify(snapshot);
	}

	function deserialize(text, env) {
		var raw;
		try {
			raw = JSON.parse(String(text || ""));
		} catch (e) {
			invalid("Flow execution snapshot is not valid JSON.", "$");
		}
		validate(raw);
		return create(raw, env);
	}

	function hydrate(snapshot, blocks, env) {
		validate(snapshot);
		env = env || {};
		var definition = neutralClone(snapshot.definition, "$.definition");
		var activeBlocks = env.blocksWithFlowHelpers
			? env.blocksWithFlowHelpers(blocks, definition)
			: blocks;
		if (env.materializeDefinitionBlocks) {
			env.materializeDefinitionBlocks(activeBlocks, definition);
		}
		return {
			definition: env.expandFlowDefinition ? env.expandFlowDefinition(activeBlocks, definition) : definition,
			blocks: activeBlocks,
			catalog: blocks,
			snapshot: snapshot
		};
	}

	return {
		format: FORMAT,
		version: VERSION,
		create: create,
		serialize: serialize,
		deserialize: deserialize,
		hydrate: hydrate,
		validate: validate
	};
}())
