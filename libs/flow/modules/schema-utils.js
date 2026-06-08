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
			properties: true
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

	function paths(schema, prefix, env) {
		schema = env.normalizeTree(schema);
		prefix = String(prefix || "");
		if (schema && typeof schema === "object" && schema.type === "array") {
			var arrayOut = prefix ? [prefix] : [];
			if (schema.items) {
				paths(schema.items, prefix, env).forEach(function (path) {
					addUnique(arrayOut, path);
				});
			}
			return arrayOut;
		}
		if (isLeaf(schema)) {
			return prefix ? [prefix] : [];
		}
		var source = schema.properties || schema;
		var filterMeta = !schema.properties;
		var keys = Object.keys(source || {}).filter(function (key) {
			return !filterMeta || !isMetaKey(key);
		});
		if (keys.length === 0) {
			return prefix ? [prefix] : [];
		}
		var out = prefix ? [prefix] : [];
		keys.forEach(function (key) {
			var childPrefix = joinPath(prefix, key);
			var child = source[key];
			if (isLeaf(child)) {
				addUnique(out, childPrefix);
			} else {
				paths(child, childPrefix, env).forEach(function (path) {
					addUnique(out, path);
				});
			}
		});
		return out;
	}

	function simpleType(schema, env) {
		schema = env.normalizeTree(schema);
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
		schema = env.normalizeTree(schema);
		prefix = String(prefix || "");
		var out = [];
		if (!schema || typeof schema !== "object") {
			return out;
		}
		if (schema.type === "array") {
			if (prefix) {
				addUnique(out, prefix);
			}
			if (schema.items) {
				arrayPaths(schema.items, prefix, env).forEach(function (path) {
					addUnique(out, path);
				});
			}
			return out;
		}
		if (isLeaf(schema)) {
			return out;
		}
		var source = schema.properties || schema;
		var filterMeta = !schema.properties;
		Object.keys(source || {}).filter(function (key) {
			return !filterMeta || !isMetaKey(key);
		}).forEach(function (key) {
			arrayPaths(source[key], joinPath(prefix, key), env).forEach(function (path) {
				addUnique(out, path);
			});
		});
		return out;
	}

	function leafEntries(schema, prefix, env) {
		schema = env.normalizeTree(schema);
		prefix = String(prefix || "");
		if (!schema || typeof schema !== "object") {
			return prefix ? [{ path: prefix, type: simpleType(schema, env) }] : [];
		}
		if (schema.type === "array") {
			return schema.items ? leafEntries(schema.items, prefix, env) : [];
		}
		if (isLeaf(schema)) {
			return prefix ? [{ path: prefix, type: simpleType(schema, env) }] : [];
		}
		var source = schema.properties || schema;
		var filterMeta = !schema.properties;
		var out = [];
		Object.keys(source || {}).filter(function (key) {
			return !filterMeta || !isMetaKey(key);
		}).forEach(function (key) {
			leafEntries(source[key], joinPath(prefix, key), env).forEach(function (entry) {
				out.push(entry);
			});
		});
		return out;
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
			current = source[parts[i]];
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
