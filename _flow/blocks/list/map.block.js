const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:vector-polyline",
  "tags": [
    "list",
    "array",
    "map",
    "iterate",
    "transform",
    "current",
  ],
  "description": "Builds a new array by evaluating one expression for each current item.",
  "summary": "{{items}} -> {{select}}",
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "unknown",
      },
    },
  },
  "properties": {
    "items": {
      "label": "Input array",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array to transform, for example local.pods.items after k8s.pod.get.",
    },
    "select": {
      "label": "Select value",
      "kind": "expression",
      "type": "unknown",
      "current": "item",
      "sourceProperty": "items",
      "default": "current",
      "description": "Expression evaluated for each item. Use current to read the item, for example current.name to extract pod names.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "map.hooks.js",
  },
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

	// Projection blocks are written in the definition of a Flow. A list.map called with values (ctx.callBlock) reads its
	// select as data: a select shaped like a projection block is refused there, never run. relayed is read on entry.
	function projectsBlocks(ctx, node, relayed, select) {
		if (!hasFlowBlock(select)) {
			return false;
		}
		if (relayed) {
			ctx.throwFlow({ code: "LIST_MAP_SELECT_NOT_SOURCE", status: 400,
				message: "A projection block of list.map is written in the definition of a Flow; this list.map was called with values." }, node);
		}
		return true;
	}

	function projectValue(ctx, value) {
		if (!value || typeof value !== "object") {
			return ctx.input({ value: value });
		}
		if (typeof value.__flowBlock === "string") {
			var metadata = value.metadata || {};
			if (metadata.disabled) return undefined;
			// A projection block is a node of this definition: its properties are source, evaluated once by the block
			// in the frame of the projection (current is the item).
			return ctx.callBlock(value.__flowBlock, value.properties || {}, { source: true, trace: false, id:metadata.id, out:metadata.out });
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

	// The select of a call: called with values without one, the items themselves. The default select, current, is the
	// source of the block, read for each item: it is not evaluated once for the whole call.
	function selectFor(node, relayed, props) {
		if (relayed && (node.props || {}).select === undefined) {
			return undefined;
		}
		return props.select === undefined ? "current" : props.select;
	}

	function projection(ctx, node, relayed, select) {
		if (select === undefined) {
			return function () { return ctx.scopes.current; };
		}
		return projectsBlocks(ctx, node, relayed, select)
			? function () { return projectValue(ctx, select); }
			: ctx.compileExpr ? ctx.compileExpr(select) : function () { return ctx.expr(select); };
	}

	return {
		run: function (ctx, node) {
			var relayed = ctx.relayedValues === true;
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var select = selectFor(node, relayed, props);
			var project = projection(ctx, node, relayed, select);
			var previous = ctx.scopes.current;
			var mapped = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				mapped.push(project());
			}
			ctx.scopes.current = previous;
			return mapped;
		},
		debug: {
			resolve: function (ctx, node) {
				var relayed = ctx.relayedValues === true;
				var props = ctx.props(node);
				var items = ctx.expr(props.items || props["in"]) || [];
				var select = selectFor(node, relayed, props);
				var project = projection(ctx, node, relayed, select);
				var previous = ctx.scopes.current;
				var mapped = [];
				var args = { items: items, select: { expression: select, deferred: "per item" } };
				Object.defineProperty(args, "__state", {
					value: { items: items, select: select, project: project, previous: previous, mapped: mapped }
				});
				return args;
			},
			run: function (ctx, node, args) {
				var state = args.__state;
				var items = state.items;
				var select = state.select;
				var project = state.project;
				var previous = state.previous;
				var mapped = state.mapped;
				for (var i = 0; i < items.length; i++) {
					ctx.scopes.current = items[i];
					mapped.push((args.select = project()));
				}
				ctx.scopes.current = previous;
				return mapped;
			}
		}
	};
}())
