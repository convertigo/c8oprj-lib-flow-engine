const _meta = {
  longDescription: "```flowscript\nthrow { code: \"INVALID\", message: \"Invalid input\" }\n```\nAny other field (line: local.line) is evaluated like a details value and placed at the top of the response error, beside code and message; path, stack, operation and names starting with __ or convertigo. are refused. With error, the path of the error local of a try (throw({ error: \"local.failure\" }), FlowScript v3 throw failure in its catch), the block raises the caught error again as it was caught, an application error staying one and a failure of the Flow staying a failure; the other properties are not used. A path that holds no caught error gives FLOW_THROW_NOT_CAUGHT.",
  "sourceVersion": 2,
  "version": 2,
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
      "description": "Optional HTTP status, rarely needed: the SDK and the frontbuilder expect 200 with the error envelope. Set it only when a client outside the SDK requires one; standard REST codes belong to URL mapper operations.",
    },
    "details": {
      "label": "Details",
      "category": "Expert",
      "kind": "template",
      "type": "object",
      "description": "Optional structured error details: each value is evaluated, a path or an expression giving its value (details: { orders: local.late, count: local.late.length }).",
    },
    "error": {
      "label": "Caught error",
      "category": "Expert",
      "kind": "path",
      "mode": "read",
      "description": "Optional path of the error local of a try (local.failure): raises that caught error again unchanged; the other properties are then not used.",
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
		if(props.error!==undefined)return {error:String(props.error)};
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
	// An author's throw is an application error: without status, the HTTP requester answers 200 with the error
	// envelope (http-flow-failure.js). The mark stays on the thrown error, hidden: it never reaches the envelope.
	var APPLICATIVE = Object.freeze({applicative:true});
	function raise(ctx,node,args){
		if(args.error!==undefined){
			// The error a try caught, kept hidden on the value of its error path: raised again as it is.
			var caught=ctx.read(args.error),original=caught&&typeof caught==="object"?caught.__flowCaughtError:undefined;
			if(original===undefined)ctx.throwFlow({code:"FLOW_THROW_NOT_CAUGHT",message:"throw error reads "+args.error+", which holds no error caught by a try.",status:500},node);
			throw original;
		}
		return ctx.throwFlow(args,node,APPLICATIVE);
	}
	return {
		stateless:true,
		debug: {resolve:argumentsFor,run:raise},
		run:function(ctx,node){return raise(ctx,node,argumentsFor(ctx,node));}
	};
}())
