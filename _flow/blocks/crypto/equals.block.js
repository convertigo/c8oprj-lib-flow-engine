const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:fingerprint",
  "tags": [
    "crypto",
    "security",
    "compare",
  ],
  "summary": "constant-time equals",
  "description": "Compares two secrets (a received key with the stored one, a signature with the expected one) in constant time, so the comparison duration tells nothing about the match. Returns false for an empty value.",
  "properties": {
    "value": {
      "label": "Value",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Received value.",
    },
    "expected": {
      "label": "Expected",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Stored or computed value it must match.",
    },
  },
  "outputs": {
    "out": {
      "type": "boolean",
    },
  },
  "runtime": "rhino",
}

(function () {
	// The classes of the JDK come from the engine that evaluates the module (flowEngineClass, kept for the runtime), else
	// by their full names: through the Packages of a call, each name looked up the names of its packages as classes again.
	function javaClass(name) {
		return typeof flowEngineClass === "function" ? flowEngineClass(name) : Packages[name];
	}
	var MessageDigest = javaClass("java.security.MessageDigest");
	var JavaString = javaClass("java.lang.String");

	function text(ctx, value) {
		var rendered = value === undefined || value === null ? "" : ctx.template(value);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var value = text(ctx, props.value);
			var expected = text(ctx, props.expected);
			if (value === "" || expected === "") {
				return false;
			}
			return MessageDigest.isEqual(new JavaString(value).getBytes("UTF-8"), new JavaString(expected).getBytes("UTF-8"));
		}
	};
}())
