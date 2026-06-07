const _meta = {
  "version": 1,
  "icon": "mdi:key-outline",
  "description": "Reads a value from the current HTTP session.",
  "properties": {
    "key": {
      "label": "key",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP session attribute name."
    },
    "default": {
      "label": "default",
      "kind": "value",
      "type": "unknown",
      "description": "Value returned when the session key is missing."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.sessionValue",
      "description": "Scope path receiving the session value."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var session = ctx.convertigoContext().httpSession;
			var value = session.getAttribute(String(ctx.template(props.key || "")));
			if (value === null || value === undefined) {
				return props["default"] === undefined ? null : ctx.input({ value: props["default"] });
			}
			return String(value);
		}
	};
}())
