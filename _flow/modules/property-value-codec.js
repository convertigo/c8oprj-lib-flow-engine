(function () {
	// Editor transport is textual; the provider's descriptor, never the previous
	// runtime value, determines how that text becomes an AST value.
	function decode(text, definition, type) {
		definition = definition || {};
		type = type || {};
		text = text == null ? "" : String(text);
		var editor = type.editor || {};
		var encoding = definition.valueEncoding || editor.valueEncoding || "typed";
		if (encoding === "text") return text;
		if (encoding !== "typed" && encoding !== "json") throw new Error("Unknown editor value encoding: " + encoding);
		if (editor.expressions === true && /\{\{[\s\S]*\}\}/.test(text)) return text;
		var shape = encoding === "json" ? type.type : definition.literalType || definition.type || type.type;
		if (shape === "value" || shape === "literal") shape = "unknown";
		if (shape === "string") return text;
		var value;
		try { value = JSON.parse(text.trim()); }
		catch (error) {
			if ((!shape || shape === "unknown") && encoding !== "json") return text;
			throw new Error("Enter a valid " + (shape || "JSON") + " value.");
		}
		if (value === null && definition.nullable === true) return value;
		var actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
		if (shape && shape !== "unknown" && (shape === "integer"
			? actual !== "number" || !isFinite(value) || Math.floor(value) !== value
			: actual !== shape || actual === "number" && !isFinite(value))) {
			throw new Error("Expected " + shape + ", received " + actual + ".");
		}
		return value;
	}
	return { decode: decode };
}())
