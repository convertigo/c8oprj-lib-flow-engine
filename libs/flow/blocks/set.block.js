const _meta = {
  "version": 1,
  "icon": "mdi:variable",
  "tags": [
    "set",
    "assign",
    "write",
    "scope",
    "variable"
  ],
  "description": "Writes a value to a scope path.",
  "longDescription": "Use path to choose the destination and value for the content. A value containing only {{ expression }} keeps the native expression type.",
  "properties": {
    "path": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "result.value",
      "description": "Scope path receiving the value."
    },
    "value": {
      "label": "value",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Value to write. Use {{ expression }} for dynamic values; scope paths are null-safe and support indexes like {{ local.items[0] }}."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "set.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.write(props.path, ctx.input(props));
		}
	};
}())
