const _meta = {
  longDescription: "```flowscript\nthrow { code: \"INVALID\", message: \"Invalid input\" }\n```\nAny other field (line: local.line) is evaluated like a details value and placed at the top of the response error, beside code and message; path, stack, operation and names starting with __ or convertigo. are refused.",
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:alert-circle-outline",
  "description": "Stops the Flow with a structured error.",
  "summary": "throw {{code}}: {{message}}",
  "properties": {
    "code": {
      "label": "Error code",
      "kind": "text",
      "type": "string",
      "default": "FLOW_THROW",
      "description": "Structured error code.",
    },
    "message": {
      "label": "Message",
      "kind": "template",
      "type": "string",
      "default": "Flow error",
      "description": "Error message template.",
    },
    "status": {
      "label": "Status code",
      "kind": "expression",
      "type": "number",
      "description": "Status code for REST operations of the URL mapper only.",
    },
    "details": {
      "label": "Details",
      "category": "Expert",
      "kind": "template",
      "type": "object",
      "description": "Optional structured error details: each value is evaluated, a path or an expression giving its value (details: { orders: local.late, count: local.late.length }).",
    },
    "hint": {
      "label": "Hint",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "description": "Optional remediation hint template.",
    },
  },
  "additionalProperties": {
    "kind": "template",
    "type": "unknown",
    "description": "Extra error field placed at the top of the response error, evaluated like a details value (line: local.line).",
  },
  "runtime": "rhino",
  "outputs": { "out": { "type": "unknown", "hidden": true } },
  "hooks": {
    "file": "throw.hooks.js",
  },
}

(function () {
	function argumentsFor(ctx,node) {
		var props=ctx.props(node);
		var args={
				code: props.code || "FLOW_THROW",
				message: ctx.template(props.message || "Flow error"),
				status: props.status === undefined ? undefined : ctx.expr(props.status),
				details: props.details === undefined ? undefined : ctx.template(props.details),
				hint: ctx.template(props.hint)
			};
		// line: 3 and other extra fields go to the top of the error (the engine refuses envelope names).
		Object.keys(props).forEach(function(key){
			if(!(key in args) && key.charAt(0)!=="$" && props[key]!==undefined)args[key]=ctx.template(props[key]);
		});
		return args;
	}
	return {
		stateless:true,
		debug: {resolve:argumentsFor,run:function(ctx,node,args){return ctx.throwFlow(args,node);}},
		run:function(ctx,node){return ctx.throwFlow(argumentsFor(ctx,node),node);}
	};
}())
