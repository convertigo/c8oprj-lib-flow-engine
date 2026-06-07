const _meta = {
  "version": 1,
  "icon": "mdi:code-json",
  "description": "Parses JSON text into a native value.",
  "properties": {
    "text": {
      "label": "text",
      "kind": "template",
      "type": "string",
      "default": "{{ local.text }}",
      "description": "JSON text to parse."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.json",
      "description": "Scope path receiving the parsed value."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "parse.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var text = ctx.template(props.text);
			if (typeof text !== "string") {
				return text;
			}
			return JSON.parse(text);
		}
	};
}())
