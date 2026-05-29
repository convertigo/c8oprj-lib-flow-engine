(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function isObject(value) {
		return value && Object.prototype.toString.call(value) === "[object Object]";
	}

	function merge(base, override) {
		var out = {};
		Object.keys(base || {}).forEach(function (key) {
			out[key] = base[key];
		});
		Object.keys(override || {}).forEach(function (key) {
			out[key] = override[key];
		});
		return out;
	}

	return {
		name: "flow.call",

		catalog: function () {
			return {
				name: "flow.call",
				icon: "mdi:call-split",
				props: {
					flow: { label: "flow", kind: "template", type: "string", "default": "", description: "Target project Flow sidecar name." },
					input: { label: "input", kind: "template", type: "object", description: "Input object passed to the child Flow." },
					config: { label: "config", kind: "template", type: "object", description: "Optional config overrides for the child Flow." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.response", description: "Scope path receiving the child Flow result." }
				},
				description: "Calls another Flow directly inside the Flow engine and returns its JSON result."
			};
		},

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "flow") || "flow"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (props.out && props.flow && String(props.flow).indexOf("{{") === -1) {
				ctx.flowOutputPaths(String(props.flow)).forEach(function (path) {
					ctx.addOutputPath("out", props.out + "." + path);
				});
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var flowName = String(ctx.template(props.flow || ""));
			var flow = ctx.flowGet(flowName);
			var childInput = isObject(props.input) ? ctx.template(props.input) : {};
			var childConfig = isObject(props.config) ? merge(ctx.scopes.config, ctx.template(props.config)) : ctx.scopes.config;
			var execution = ctx.runFlowSource(flow.source, childConfig, {
				input: childInput,
				context: {
					input: childInput,
					parentFlow: ctx.request && ctx.request.context && ctx.request.context.flowName || ""
				},
				includeTrace: false
			});
			return execution.result;
		}
	};
}())
