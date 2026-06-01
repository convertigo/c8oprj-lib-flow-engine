(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function isObject(value) {
		return value && Object.prototype.toString.call(value) === "[object Object]";
	}

	function inputValue(ctx, value) {
		if (isObject(value) && value.value !== undefined) {
			return ctx.input(value);
		}
		if (typeof value === "string") {
			return ctx.expr(value);
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return inputValue(ctx, item);
			});
		}
		if (isObject(value)) {
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = inputValue(ctx, value[key]);
			});
			return out;
		}
		return ctx.literal(value);
	}

	function flowName(ctx, value) {
		value = value === undefined || value === null ? "" : value;
		return String(value).indexOf("{{") === -1 ? String(value) : ctx.render(value);
	}

	return {
		name: "flow.call",

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "flow") || "flow"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var name = flowName(ctx, prop(node, "flow") || prop(node, "name"));
			if (!name) {
				ctx.raise("MISSING_FLOW_NAME", "flow.call requires a flow name.", node);
			}
			var flow = ctx.flowGet(name);
			var childInput = inputValue(ctx, props.input || {});
			var execution = ctx.runFlowSource(flow.source, ctx.scopes.config, {
				input: childInput,
				context: {
					input: childInput
				},
				includeTrace: false
			});
			return execution.result;
		}
	};
}())
