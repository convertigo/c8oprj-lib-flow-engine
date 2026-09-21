(function () {
	// Source spelling only. Values, bindings and AST storage are deliberately untouched.
	function failure(code, name) {
		var error = new Error(code + ": " + name);
		error.code = code;
		error.attribute = name;
		throw error;
	}

	function requireName(name) {
		if (typeof name !== "string" || !name.length) {
			failure("FLOW_SOURCE_ATTRIBUTE_NAME_INVALID", name);
		}
	}

	function decode(name) {
		requireName(name);
		if (name.indexOf("$$$") === 0) {
			return { namespace: "property", name: name.substring(1) };
		}
		if (name.indexOf("$$") === 0) {
			if (name.length === 2) {
				failure("FLOW_SOURCE_ATTRIBUTE_NAME_INVALID", name);
			}
			return { namespace: "engine", name: name.substring(2) };
		}
		return { namespace: "property", name: name };
	}

	function encode(namespace, name) {
		requireName(name);
		if (namespace === "property") {
			return name.indexOf("$$") === 0 ? "$" + name : name;
		}
		if (namespace !== "engine" || name.charAt(0) === "$") {
			failure("FLOW_SOURCE_ATTRIBUTE_NAMESPACE_INVALID", name);
		}
		return "$$" + name;
	}

	// Each surface declares its supported engine attributes; no per-block guessing.
	function resolve(name, engineAttributes) {
		var decoded = decode(name);
		if (decoded.namespace === "engine"
				&& (!engineAttributes || engineAttributes.indexOf(decoded.name) < 0)) {
			failure("FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN", name);
		}
		return decoded;
	}

	return { decode: decode, encode: encode, resolve: resolve };
}())
