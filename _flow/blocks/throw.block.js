const _meta = {
  longDescription: "```flowscript\nthrow { code: \"INVALID\", message: \"Invalid input\", status: 400 }\n```",
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
      "description": "Optional HTTP-style status code.",
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
  "runtime": "rhino",
  "outputs": { "out": { "type": "unknown", "hidden": true } },
  "hooks": {
    "file": "throw.hooks.js",
  },
}

(function () {
	function argumentsFor(ctx,node) {
		var props=ctx.props(node);
		return {
				code: props.code || "FLOW_THROW",
				message: ctx.template(props.message || "Flow error"),
				status: props.status === undefined ? undefined : ctx.expr(props.status),
				details: props.details === undefined ? undefined : ctx.template(props.details),
				hint: ctx.template(props.hint)
			};
	}
	return {
		stateless:true,
		debug: {resolve:argumentsFor,run:function(ctx,node,args){return ctx.throwFlow(args,node);}},
		run:function(ctx,node){return ctx.throwFlow(argumentsFor(ctx,node),node);}
	};
}())
