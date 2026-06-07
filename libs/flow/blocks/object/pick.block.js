const _meta = {
  "version": 1,
  "icon": "mdi:select-group",
  "description": "Builds an object from selected fields.",
  "properties": {
    "source": {
      "label": "source",
      "kind": "expression",
      "type": "object",
      "default": "local.object",
      "description": "Object expression to read from."
    },
    "keys": {
      "label": "keys",
      "kind": "literal",
      "type": "array|string",
      "default": "",
      "description": "Comma-separated list or array of fields to copy. Nested paths are supported."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.picked",
      "description": "Scope path receiving the selected fields."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "pick.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function keys(value) {
		if (!value) {
			return [];
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) { return String(item); });
		}
		return String(value).split(/[\n,]/).map(function (item) {
			return item.trim();
		}).filter(function (item) {
			return item !== "";
		});
	}

	function outputKey(path) {
		var parts = String(path).split(".");
		return parts[parts.length - 1];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = typeof props.source === "string" ? ctx.expr(props.source) : ctx.template(props.source);
			var out = {};
			keys(props.keys).forEach(function (path) {
				var value = ctx.readObjectPath(source, path);
				if (value !== undefined) {
					out[outputKey(path)] = value;
				}
			});
			return out;
		}
	};
}())
