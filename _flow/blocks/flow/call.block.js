const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:transit-connection-variant",
  "tags": [
    "flow",
  ],
  "description": "Calls another Flow without going through Convertigo requestable/XML execution.",
  "longDescription": "The value is the result of the called Flow as it is. When the called Flow fails (a throw, a failed block), the call fails with that error unchanged, as requestable.call does: catch it with try { flow.call({ … }) } catch (e) { … }, where e holds code, message, status, hint, details and the other fields of the thrown object (e.field), and throw e raises it again; or set onError: \"return\" to get { error: { code, message, status, path, hint, details, … } } as the value instead.",
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
    "onError": {
      "label": "On error",
      "kind": "select",
      "type": "string",
      "enum": ["raise", "return"],
      "default": "raise",
      "description": "When the called Flow fails (a throw, a failed block), as for requestable.call: raise makes this call fail with that error, so the caller stops unless a try catches it; return gives the value { error: { code, message, status, path, hint, details } } with the other fields of the thrown object instead, for a caller that handles the failure itself. An unknown Flow name is always raised.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "description": "The result of the called Flow as it is; { error } with onError return when it fails.",
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

	function execute(ctx,name,childInput) {
			var execution = ctx.runFlowSource(null, ctx.scopes.config, {
				flowName: name,
				namedFlowName: name,
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
	// The error of the called Flow as the engine answers it (Engine.js failure), without the operation: what
	// requestable.call gives with onError return.
	function errorValue(error) {
		var value = error && (error.flowError || error) || {};
		var out = {
			code: String(value.code || "FLOW_ENGINE_ERROR"),
			message: String(value.message || error),
			path: String(value.path || ""),
			hint: value.hint ? String(value.hint) : ""
		};
		if (value.status !== undefined && value.status !== null && value.status !== "") out.status = Number(value.status);
		if (value.details !== undefined && value.details !== null) out.details = value.details;
		var fields = value.fields;
		if (fields && typeof fields === "object") Object.keys(fields).forEach(function (key) {
			if (!Object.prototype.hasOwnProperty.call(out, key) && fields[key] !== undefined) out[key] = fields[key];
		});
		return out;
	}

	// onError return: a failure of the called Flow is the value { error }. A cancelled run and an unknown Flow name (an
	// error of the call itself, not of the called Flow) are still raised.
	function call(ctx,name,childInput,onError) {
		if (String(onError || "raise") !== "return") return execute(ctx, name, childInput);
		try {
			return execute(ctx, name, childInput);
		} catch (error) {
			var code = error && String(error.code || "");
			if (code === "FLOW_CANCELLED" || code === "UNKNOWN_FLOW" && String(error.message) === "Unknown Flow: " + name) throw error;
			return { error: errorValue(error) };
		}
	}
	function argumentsFor(ctx,node) {
		var props=ctx.props(node),name=flowName(ctx,prop(node,"flow") || prop(node,"name"));
		if(!name)ctx.raise("MISSING_FLOW_NAME","flow.call requires a flow name.",node);
		return {flow:name,input:inputValue(ctx,props.input || {}),onError:props.onError};
	}
	return {
		debug:{resolve:argumentsFor,run:function(ctx,node,args){return call(ctx,args.flow,args.input,args.onError);}},
		run:function(ctx,node){
			var props = ctx.props(node);
			var name = flowName(ctx, prop(node, "flow") || prop(node, "name"));
			if (!name) ctx.raise("MISSING_FLOW_NAME", "flow.call requires a flow name.", node);
			return call(ctx, name, inputValue(ctx, props.input || {}), props.onError);
		}
	};
}())
