const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:transit-connection-variant",
  "tags": [
    "flow",
  ],
  "description": "Calls another Flow without going through Convertigo requestable/XML execution.",
  "summary": "call {{flow}}",
  "properties": {
    "flow": {
      "label": "Flow",
      "kind": "text",
      "type": "string",
      "description": "Project Flow to execute in the Flow engine.",
    },
    "input": {
      "label": "Input",
      "kind": "expression",
      "type": "object",
      "description": "Object passed as input to the called Flow.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "call.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function isObject(value) {
		return value && Object.prototype.toString.call(value) === "[object Object]";
	}

	// input as a whole is an expression (input: local.in), or the JSON text a block relays; a tree may still give it as
	// one ${...}. Inside an object or a list, values follow the value notation: an expression is ${...}, any other
	// string is the text itself (status: "AVAILABLE", name: "input.name", count: "3"), never read as an expression.
	function inputValue(ctx, value, nested) {
		if (typeof value === "string") {
			if (!nested) return /^\s*(?:\$\{|\{\{)/.test(value) ? ctx.template(value) : ctx.expr(value);
			return /\$\{|\{\{/.test(value) ? ctx.template(value) : value;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return inputValue(ctx, item, true);
			});
		}
		if (isObject(value)) {
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = inputValue(ctx, value[key], true);
			});
			return out;
		}
		return ctx.literal(value);
	}

	function flowName(ctx, value) {
		value = value === undefined || value === null ? "" : value;
		return !/\$\{|\{\{/.test(String(value)) ? String(value) : ctx.render(value);
	}

	function execute(ctx,source,name,childInput) {
			var execution = ctx.runFlowSource(source, ctx.scopes.config, {
				flowName: name,
				input: childInput,
				context: {
					input: childInput
				},
				includeTrace: false
			});
			// the warnings of the called Flow are the warnings of the caller's run, with the name of that Flow
			if (execution && execution.warnings && typeof ctx.warn === "function") {
				execution.warnings.forEach(function (warning) {
					ctx.warn(Object.assign({}, warning, { flow: warning.flow || name }));
				});
			}
			return execution.result;
	}
	function argumentsFor(ctx,node) {
		var props=ctx.props(node),name=flowName(ctx,prop(node,"flow") || prop(node,"name"));
		if(!name)ctx.raise("MISSING_FLOW_NAME","flow.call requires a flow name.",node);
		var flow=ctx.flowGet(name),args={flow:name,input:inputValue(ctx,props.input || {})};
		Object.defineProperty(args,"source",{value:flow.source});
		return args;
	}
	return {
		debug:{resolve:argumentsFor,run:function(ctx,node,args){return execute(ctx,args.source,args.flow,args.input);}},
		run:function(ctx,node){
			var props = ctx.props(node);
			var name = flowName(ctx, prop(node, "flow") || prop(node, "name"));
			if (!name) ctx.raise("MISSING_FLOW_NAME", "flow.call requires a flow name.", node);
			var flow = ctx.flowGet(name);
			return execute(ctx, flow.source, name, inputValue(ctx, props.input || {}));
		}
	};
}())
