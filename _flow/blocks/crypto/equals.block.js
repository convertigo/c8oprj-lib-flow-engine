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
			return java.security.MessageDigest.isEqual(new java.lang.String(value).getBytes("UTF-8"), new java.lang.String(expected).getBytes("UTF-8"));
		}
	};
}())
