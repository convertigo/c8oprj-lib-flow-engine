const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:source-branch-sync",
  "description": "Applies Flow or FlowEngine mutations without writing files.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "target": {
      "label": "Tree",
      "kind": "text",
      "type": "string",
      "description": "Mutation target: flow or engine. Defaults to flow.",
    },
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow name.",
    },
    "flowSource": {
      "label": "Flow source",
      "kind": "text",
      "type": "string",
      "description": "Flow YAML source.",
    },
    "definition": {
      "label": "Definition",
      "kind": "literal",
      "type": "object",
      "description": "Flow definition object.",
    },
    "engineSource": {
      "label": "Engine source",
      "kind": "text",
      "type": "string",
      "description": "FlowEngine YAML source.",
    },
    "mutation": {
      "label": "Mutation",
      "kind": "literal",
      "type": "object",
      "description": "Single mutation to apply.",
    },
    "mutations": {
      "label": "Mutations",
      "kind": "literal",
      "type": "array",
      "description": "Mutations to apply in order.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "apply.hooks.js",
  },
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
		if (!hasDefinition && !hasSource && args.name && String(args.target || "flow") === "flow") {
			var flow = ctx.flowGet(args.name, args);
			args.flowSource = flow.source;
			if (!args.flowName) {
				args.flowName = args.name;
			}
		}
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.applyMutationSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
