const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:account-key-outline",
  "description": "Writes a value into the current HTTP session.",
  "summary": "session {{key}} = {{value}}",
  "properties": {
    "key": {
      "label": "key",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP session attribute name.",
    },
    "value": {
      "label": "value",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Value stored in the session. Non-string values are stored as JSON text.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "set.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function sessionString(value) {
		if (value === undefined || value === null) {
			return "";
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var value = sessionString(ctx.input(props));
			ctx.convertigoContext().httpSession.setAttribute(String(ctx.template(props.key || "")), value);
			return value;
		}
	};
}())
