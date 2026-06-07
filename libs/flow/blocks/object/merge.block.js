const _meta = {
  "version": 1,
  "icon": "mdi:merge",
  "description": "Creates a shallow object merge.",
  "properties": {
    "target": {
      "label": "target",
      "kind": "expression",
      "type": "object",
      "default": "local.object",
      "description": "Base object expression."
    },
    "source": {
      "label": "source",
      "kind": "expression",
      "type": "object",
      "default": "local.patch",
      "description": "Object expression overriding target keys."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.merged",
      "description": "Scope path receiving the merged object."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "merge.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function objectValue(ctx, value) {
		if (value === undefined || value === null) {
			return {};
		}
		return typeof value === "string" ? ctx.expr(value) : ctx.template(value);
	}

	function copy(out, value) {
		if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
			return;
		}
		Object.keys(value).forEach(function (key) {
			out[key] = value[key];
		});
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var out = {};
			copy(out, objectValue(ctx, props.target));
			copy(out, objectValue(ctx, props.source));
			return out;
		}
	};
}())
