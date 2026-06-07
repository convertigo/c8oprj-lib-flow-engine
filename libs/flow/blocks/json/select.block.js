const _meta = {
  "version": 1,
  "icon": "mdi:select-search",
  "description": "Reads a nested value from a JSON object.",
  "properties": {
    "source": {
      "label": "source object",
      "kind": "expression",
      "type": "object",
      "default": "local.source",
      "hidden": true,
      "description": "Backing source expression edited by the data path selector."
    },
    "path": {
      "label": "data path",
      "kind": "selector",
      "type": "string",
      "mode": "read",
      "sourceProperty": "source",
      "default": "",
      "description": "Relative path to read inside the source object. Supports indexes like rss.channel.item[0].title."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.value",
      "description": "Scope path receiving the selected value."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "select.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = ctx.expr(props.source);
			return ctx.readObjectPath(source, props.path);
		}
	};
}())
