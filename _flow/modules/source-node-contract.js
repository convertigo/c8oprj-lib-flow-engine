(function () {
	// The source reader owns syntax/value parsing. This boundary owns namespaces only.
	// It is deliberately not activated by the legacy parser during the rollout.
	var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
	var array = function (value) { return Object.prototype.toString.call(value) === "[object Array]"; };
	function fail(code, path) {
		var error = new Error(code + ": " + path);
		error.code = code;
		error.path = path;
		throw error;
	}
	function bag(value, path) {
		if (!value || typeof value !== "object" || array(value)) {
			fail("FLOW_AST_EXPECTED_OBJECT", path);
		}
		return value;
	}
	function put(target, key, value) {
		// Also safe for ordinary JSON keys such as __proto__, constructor and toString.
		Object.defineProperty(target, key, { value: value, enumerable: true, writable: true, configurable: true });
	}
	function copy(value, path, ancestors) {
		if (value === null || typeof value === "string" || typeof value === "boolean") return value;
		if (typeof value === "number" && isFinite(value)) return value;
		if (!value || typeof value !== "object") fail("FLOW_AST_NON_JSON_VALUE", path);
		ancestors = ancestors || [];
		if (ancestors.indexOf(value) !== -1) fail("FLOW_AST_CYCLIC_VALUE", path);
		ancestors.push(value);
		var result = array(value) ? [] : {};
		if (array(value)) {
			for (var i = 0; i < value.length; i++) {
				if (!own(value, i)) fail("FLOW_AST_NON_JSON_VALUE", path + "/" + i);
				result.push(copy(value[i], path + "/" + i, ancestors));
			}
		} else {
			var prototype = Object.getPrototypeOf(value);
			if (prototype !== null && prototype !== Object.prototype) fail("FLOW_AST_NON_JSON_VALUE", path);
			Object.keys(value).forEach(function (key) {
				var descriptor = Object.getOwnPropertyDescriptor(value, key);
				if (!own(descriptor, "value")) fail("FLOW_AST_NON_JSON_VALUE", path + "/" + key);
				put(result, key, copy(descriptor.value, path + "/" + key, ancestors));
			});
		}
		ancestors.pop();
		return result;
	}
	function create(codec, engineAttributes) {
		bag(engineAttributes, "engineAttributes");
		var names = Object.keys(engineAttributes);
		function metadata(name, value, path) {
			if (!own(engineAttributes, name)) fail("FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN", path);
			var type = engineAttributes[name];
			if (type !== "string" && type !== "boolean") fail("FLOW_AST_METADATA_CONTRACT_INVALID", name);
			if (typeof value !== type || (name === "id" && !value.length)) {
				fail("FLOW_SOURCE_ENGINE_ATTRIBUTE_TYPE", path);
			}
			return value;
		}
		function readAttributes(entries) {
			if (!array(entries)) fail("FLOW_SOURCE_EXPECTED_ATTRIBUTES", "attributes");
			var result = { meta: {}, props: {}, slots: {} };
			entries.forEach(function (entry) {
				bag(entry, "attribute");
				var decoded = codec.resolve(entry.name, names);
				var target = decoded.namespace === "engine" ? result.meta : result.props;
				if (own(target, decoded.name)) fail("FLOW_SOURCE_DUPLICATE_ATTRIBUTE", entry.name);
				put(target, decoded.name, decoded.namespace === "engine"
					? metadata(decoded.name, entry.value, entry.name) : copy(entry.value, entry.name));
			});
			return result;
		}
		function header(node) {
			bag(node, "node");
			Object.keys(node).forEach(function (key) {
				if (["meta", "props", "slots"].indexOf(key) === -1) fail("FLOW_AST_UNKNOWN_FIELD", key);
			});
			var result = { meta: {}, props: copy(bag(node.props, "props"), "props"), slots: {} };
			Object.keys(bag(node.meta, "meta")).forEach(function (key) {
				put(result.meta, key, metadata(key, node.meta[key], "meta/" + key));
			});
			bag(node.slots, "slots");
			return result;
		}
		function snapshot(node, ancestors) {
			ancestors = ancestors || [];
			if (ancestors.indexOf(node) !== -1) fail("FLOW_AST_CYCLIC_VALUE", "slots");
			ancestors.push(node);
			var result = header(node);
			Object.keys(node.slots).forEach(function (key) {
				if (!key || !array(node.slots[key])) fail("FLOW_AST_EXPECTED_SLOT", "slots/" + key);
				put(result.slots, key, node.slots[key].map(function (child) { return snapshot(child, ancestors); }));
			});
			ancestors.pop();
			return result;
		}
		function writeAttributes(node) {
			// Slots are serialized by their own syntax; they must never leak into props.
			// Do not recursively copy children for every emitted node (quadratic on chains).
			var validated = header(node);
			var entries = [];
			["meta", "props"].forEach(function (part) {
				Object.keys(validated[part]).forEach(function (name) {
					entries.push({ name: codec.encode(part === "meta" ? "engine" : "property", name), value: validated[part][name] });
				});
			});
			return entries;
		}
		return { readAttributes: readAttributes, writeAttributes: writeAttributes, snapshot: snapshot };
	}
	return { create: create };
}())
