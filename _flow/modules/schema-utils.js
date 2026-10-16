(function () {
	function addUnique(array, value) {
		if (array.indexOf(value) === -1) {
			array.push(value);
		}
	}

	function joinPath(base, leaf) {
		base = String(base || "");
		leaf = String(leaf || "");
		if (base === "") {
			return leaf;
		}
		if (leaf === "") {
			return base;
		}
		return base + "." + leaf;
	}

	function arrayItemPath(prefix) {
		prefix = String(prefix || "");
		return prefix ? prefix + "[0]" : "[0]";
	}

	function valueType(value) {
		if (value === null || value === undefined) {
			return "null";
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return "array";
		}
		if (typeof value === "object") {
			return "object";
		}
		if (typeof value === "number") {
			return Math.floor(value) === value ? "integer" : "number";
		}
		if (typeof value === "boolean") {
			return "boolean";
		}
		return "string";
	}

	function merge(left, right) {
		if (!left) {
			return right;
		}
		if (!right) {
			return left;
		}
		if (left.type === "unknown") {
			return right;
		}
		if (right.type === "unknown") {
			return left;
		}
		if (left.type !== right.type) {
			return { type: "unknown" };
		}
		if (left.type === "object") {
			var properties = {};
			Object.keys(left.properties || {}).forEach(function (key) {
				properties[key] = left.properties[key];
			});
			Object.keys(right.properties || {}).forEach(function (key) {
				properties[key] = merge(properties[key], right.properties[key]);
			});
			return { type: "object", properties: properties };
		}
		if (left.type === "array") {
			return { type: "array", items: merge(left.items, right.items) || { type: "unknown" } };
		}
		return left;
	}

	function infer(value, depth, env) {
		if (env.isRuntimeHandle(value)) {
			return { type: "handle<" + env.runtimeHandleType(value) + ">", handle: true };
		}
		value = env.normalizeTree(value);
		depth = depth || 0;
		if (depth > 8) {
			return { type: "unknown" };
		}
		var type = valueType(value);
		if (type === "array") {
			var itemSchema = null;
			for (var i = 0; i < value.length && i < 12; i++) {
				itemSchema = merge(itemSchema, infer(value[i], depth + 1, env));
			}
			return { type: "array", items: itemSchema || { type: "unknown" } };
		}
		if (type === "object") {
			var properties = {};
			Object.keys(value || {}).slice(0, 120).forEach(function (key) {
				properties[key] = infer(value[key], depth + 1, env);
			});
			return { type: "object", properties: properties };
		}
		return { type: type };
	}

	function isMetaKey(key) {
		return {
			type: true,
			description: true,
			longDescription: true,
			required: true,
			"default": true,
			nullable: true,
			enum: true,
			format: true,
			example: true,
			examples: true,
			items: true,
			properties: true,
			additionalProperties: true
		}[key] === true;
	}

	function isLeaf(value) {
		if (value === null || value === undefined) {
			return true;
		}
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			return true;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return true;
		}
		if (typeof value === "object" && value.type && value.type !== "object" && !value.properties) {
			if (value.type === "array" && value.items) {
				return false;
			}
			return true;
		}
		return false;
	}

	// Paths, array paths and leaves of a schema: the schema is made plain once, then walked (a copy at each level made
	// the walk quadratic on large schemas); each list keeps the first occurrence of a path.
	function uniqueList() {
		var list = [];
		var seen = Object.create(null);
		return {
			list: list,
			add: function (value) {
				if (!seen[value]) {
					seen[value] = true;
					list.push(value);
				}
			}
		};
	}

	function paths(schema, prefix, env) {
		var out = uniqueList();
		collectPaths(env.normalizeTree(schema), String(prefix || ""), out);
		return out.list;
	}

	function collectPaths(schema, prefix, out) {
		if (schema && typeof schema === "object" && schema.type === "array") {
			if (prefix) {
				out.add(prefix);
			}
			if (schema.items) {
				collectPaths(schema.items, arrayItemPath(prefix), out);
			}
			return;
		}
		if (isLeaf(schema)) {
			if (prefix) {
				out.add(prefix);
			}
			return;
		}
		var source = schema.properties || schema;
		var filterMeta = !schema.properties;
		var keys = Object.keys(source || {}).filter(function (key) {
			return !filterMeta || !isMetaKey(key);
		});
		if (prefix) {
			out.add(prefix);
		}
		keys.forEach(function (key) {
			var childPrefix = joinPath(prefix, key);
			var child = source[key];
			if (isLeaf(child)) {
				out.add(childPrefix);
			} else {
				collectPaths(child, childPrefix, out);
			}
		});
	}

	function simpleType(schema, env) {
		return plainSimpleType(env.normalizeTree(schema));
	}

	function plainSimpleType(schema) {
		if (!schema || typeof schema !== "object") {
			return schema === null ? "null" : typeof schema;
		}
		if (schema.type) {
			return String(schema.type);
		}
		if (schema.properties) {
			return "object";
		}
		return "unknown";
	}

	function arrayPaths(schema, prefix, env) {
		var out = uniqueList();
		collectArrayPaths(env.normalizeTree(schema), String(prefix || ""), out);
		return out.list;
	}

	function collectArrayPaths(schema, prefix, out) {
		if (!schema || typeof schema !== "object") {
			return;
		}
		if (schema.type === "array") {
			if (prefix) {
				out.add(prefix);
			}
			if (schema.items) {
				collectArrayPaths(schema.items, arrayItemPath(prefix), out);
			}
			return;
		}
		if (isLeaf(schema)) {
			return;
		}
		var source = schema.properties || schema;
		var filterMeta = !schema.properties;
		Object.keys(source || {}).filter(function (key) {
			return !filterMeta || !isMetaKey(key);
		}).forEach(function (key) {
			collectArrayPaths(source[key], joinPath(prefix, key), out);
		});
	}

	function leafEntries(schema, prefix, env) {
		var out = [];
		collectLeafEntries(env.normalizeTree(schema), String(prefix || ""), out);
		return out;
	}

	function collectLeafEntries(schema, prefix, out) {
		if (!schema || typeof schema !== "object") {
			if (prefix) {
				out.push({ path: prefix, type: plainSimpleType(schema) });
			}
			return;
		}
		if (schema.type === "array") {
			if (schema.items) {
				collectLeafEntries(schema.items, arrayItemPath(prefix), out);
			}
			return;
		}
		if (isLeaf(schema)) {
			if (prefix) {
				out.push({ path: prefix, type: plainSimpleType(schema) });
			}
			return;
		}
		var source = schema.properties || schema;
		var filterMeta = !schema.properties;
		Object.keys(source || {}).filter(function (key) {
			return !filterMeta || !isMetaKey(key);
		}).forEach(function (key) {
			collectLeafEntries(source[key], joinPath(prefix, key), out);
		});
	}

	function atPath(schema, path, env) {
		if (!schema) {
			return null;
		}
		var current = schema;
		var text = String(path || "");
		if (text === "") {
			return current;
		}
		var parts = env.objectPathParts(text);
		for (var i = 0; i < parts.length; i++) {
			if (!current) {
				return null;
			}
			if (current.type === "array" && current.items) {
				current = current.items;
				if (/^\d+$/.test(String(parts[i]))) {
					continue;
				}
			}
			var source = current.properties || current;
			current = Object.prototype.hasOwnProperty.call(source, parts[i]) ? source[parts[i]]
				: current.type === "object" && current.additionalProperties && typeof current.additionalProperties === "object" ? current.additionalProperties : null;
		}
		return current || null;
	}

	function unwrapDocument(schema, env) {
		schema = env.normalizeTree(schema);
		if (!schema) {
			return schema;
		}
		if (schema.type === "object" && schema.properties && schema.properties.document) {
			return schema.properties.document;
		}
		if (!schema.type && schema.document !== undefined && Object.keys(schema).length === 1) {
			return schema.document;
		}
		return schema;
	}

	function hasContent(schema) {
		if (!schema) {
			return false;
		}
		if (schema.type && schema.type !== "object") {
			return true;
		}
		return Object.keys(schema.properties || {}).length > 0;
	}

	function score(schema, env) {
		schema = env.normalizeTree(schema);
		if (!schema) {
			return 0;
		}
		if (schema.type === "unknown" || schema.type === "null") {
			return 0;
		}
		if (schema.type === "array") {
			return score(schema.items, env);
		}
		if (schema.type === "object" || schema.properties) {
			var out = 0;
			Object.keys(schema.properties || {}).forEach(function (key) {
				out += score(schema.properties[key], env);
			});
			return out;
		}
		return schema.type ? 1 : 0;
	}

	function assignAtPath(root, path, schema) {
		if (!path || !schema) {
			return;
		}
		var parts = String(path).split(".");
		var current = root;
		for (var i = 0; i < parts.length - 1; i++) {
			var part = parts[i];
			current.type = "object";
			current.properties = current.properties || {};
			if (!current.properties[part]) {
				current.properties[part] = { type: "object", properties: {} };
			}
			current = current.properties[part];
		}
		current.type = "object";
		current.properties = current.properties || {};
		var leaf = parts[parts.length - 1];
		current.properties[leaf] = merge(current.properties[leaf], schema) || schema;
	}

	function item(schema) {
		return schema && schema.type === "array" && schema.items ? schema.items : schema;
	}

	function object(schema, env) {
		schema = env.normalizeTree(schema || {});
		if (schema.type) {
			return schema;
		}
		return {
			type: "object",
			properties: schema
		};
	}

	return {
		valueType: valueType,
		merge: merge,
		infer: infer,
		isMetaKey: isMetaKey,
		isLeaf: isLeaf,
		paths: paths,
		simpleType: simpleType,
		arrayPaths: arrayPaths,
		leafEntries: leafEntries,
		atPath: atPath,
		unwrapDocument: unwrapDocument,
		hasContent: hasContent,
		score: score,
		assignAtPath: assignAtPath,
		item: item,
		object: object
	};
}())
