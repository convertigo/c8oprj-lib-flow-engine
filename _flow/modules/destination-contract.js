(function () {
	// Pure contract: shared by analysis, execution and browser editors. No Rhino
	// or DOM dependency. Other execution environments supply their own roots.
	function policy() { return { roots: ["local", "result"], syntax: "named-path" }; }
	function validate(value, options) {
		options = options || policy();
		var roots = options.roots || policy().roots;
		function invalid(reason, message) {
			return { valid: false, code: "INVALID_DESTINATION", reason: reason, message: message };
		}
		if (value === undefined || value === null || value === "") {
			return options.required ? invalid("missing", "Choose a named destination.") : { valid: true, parts: [] };
		}
		if (typeof value !== "string" || !/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(value)) {
			return invalid("syntax", "Use a static named path, for example local.value. Expressions and array indexes are not destinations.");
		}
		var parts = value.split(".");
		if (roots.indexOf(parts[0]) < 0) {
			return invalid("scope", "Choose a destination under " + roots.join(" or ") + "; other scopes are read-only here.");
		}
		if (options.bases && options.bases.indexOf(parts.slice(0, 2).join(".")) < 0) {
			return invalid("scope", "Choose a declared writable State variable.");
		}
		for (var i = 1; i < parts.length; i++) {
			if (["__proto__", "prototype", "constructor"].indexOf(parts[i]) >= 0) {
				return invalid("reserved", "Reserved property names cannot be used in a destination.");
			}
		}
		return { valid: true, parts: parts };
	}
	function isWriteProperty(catalog, key, sourceVersion) {
		var descriptor = catalog.props && catalog.props[key] || {};
		return (catalog.writes || []).indexOf(key) >= 0 || descriptor.kind === "path" && descriptor.mode === "write"
			|| sourceVersion !== 2 && key === "out" && !!(catalog.outputs && catalog.outputs.out);
	}
	function entries(catalog, props, out, sourceVersion) {
		var result = [{ property: sourceVersion === 2 ? "$$out" : "out", value: out }];
		Object.keys(props || {}).forEach(function (key) {
			if (isWriteProperty(catalog || {}, key, sourceVersion) && !(sourceVersion !== 2 && key === "out")) {
				result.push({ property: key, value: props[key] });
			}
		});
		return result;
	}
	return { policy: policy, validate: validate, isWriteProperty: isWriteProperty, entries: entries };
}())
