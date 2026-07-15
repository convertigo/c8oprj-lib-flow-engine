const _meta = {
  "version": 1,
  "icon": "mdi:vector-polyline",
  "tags": [
    "list",
    "array",
    "map",
    "iterate",
    "transform",
    "current"
  ],
  "description": "Builds a new array by evaluating one expression for each current item.",
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "unknown"
      }
    }
  },
  "properties": {
    "items": {
      "label": "Input array",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array to transform, for example local.pods.items after k8s.pod.get."
    },
    "select": {
      "label": "Select value",
      "kind": "expression",
      "type": "unknown",
      "current": "item",
      "sourceProperty": "items",
      "default": "current",
      "description": "Expression evaluated for each item. Use current to read the item, for example current.name to extract pod names."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.mapped",
      "description": "Scope path receiving the mapped array."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "map.hooks.js"
  }
}

(function () {
	function hasFlowBlock(value) {
		if (!value || typeof value !== "object") {
			return false;
		}
		if (typeof value.__flowBlock === "string") {
			return true;
		}
		return Object.keys(value).some(function (key) {
			return hasFlowBlock(value[key]);
		});
	}

	function projectValue(ctx, value) {
		if (!value || typeof value !== "object") {
			return ctx.input({ value: value });
		}
		if (typeof value.__flowBlock === "string") {
			var properties = {};
			Object.keys(value.properties || {}).forEach(function (key) {
				properties[key] = ctx.input({ value: value.properties[key] });
			});
			return ctx.callBlock(value.__flowBlock, properties, { trace: false });
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) { return projectValue(ctx, item); });
		}
		var out = {};
		Object.keys(value).forEach(function (key) {
			out[key] = projectValue(ctx, value[key]);
		});
		return out;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var select = props.select === undefined ? "current" : props.select;
			var project = hasFlowBlock(select)
				? function () { return projectValue(ctx, select); }
				: ctx.compileExpr ? ctx.compileExpr(select) : function () { return ctx.expr(select); };
			var previous = ctx.scopes.current;
			var mapped = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				mapped.push(project());
			}
			ctx.scopes.current = previous;
			return mapped;
		}
	};
}())
