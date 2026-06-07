const _meta = {
  "version": 1,
  "icon": "mdi:code-json",
  "description": "Serializes a native value as JSON text.",
  "properties": {
    "value": {
      "label": "value",
      "kind": "value",
      "type": "unknown",
      "default": "{{ local.value }}",
      "description": "Value to serialize as JSON."
    },
    "pretty": {
      "label": "pretty",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Write indented JSON when true."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.text",
      "description": "Scope path receiving the JSON text."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "stringify.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return JSON.stringify(ctx.input(props), null, props.pretty === true ? 2 : 0);
		}
	};
}())
