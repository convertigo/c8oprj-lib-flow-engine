const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:code-json",
  "description": "Returns the best known JSON output schema for a Flow.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow sidecar name."
    },
    "flowName": {
      "label": "flowName",
      "kind": "text",
      "type": "string",
      "description": "Alias for name."
    },
    "flowSource": {
      "label": "flowSource",
      "kind": "text",
      "type": "string",
      "description": "Flow YAML source."
    },
    "definition": {
      "label": "definition",
      "kind": "literal",
      "type": "object",
      "description": "Flow definition object."
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving output schema."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "outputSchema.hooks.js"
  }
}

(function () {
	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	function withNamedFlowSource(ctx, args) {
		var hasDefinition = args.definition !== undefined && args.definition !== null;
		var hasSource = args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "";
		if (!hasDefinition && !hasSource && (args.name || args.flowName)) {
			var name = args.name || args.flowName;
			var flow = ctx.flowGet(name, args);
			args.flowSource = flow.source;
			if (!args.flowName) {
				args.flowName = name;
			}
		}
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.outputSchemaSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
