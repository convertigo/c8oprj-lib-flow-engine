const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:graph-outline",
  "description": "Returns visible scope paths at a Flow node.",
  "properties": {
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow name.",
    },
    "flowName": {
      "label": "Flow name (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for name.",
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
    "node": {
      "label": "Node id",
      "kind": "text",
      "type": "string",
      "description": "Target node id.",
    },
    "path": {
      "label": "Tree path",
      "kind": "text",
      "type": "string",
      "description": "Target virtual tree path.",
    },
    "property": {
      "label": "Property",
      "kind": "text",
      "type": "string",
      "description": "Target property name.",
    },
    "mode": {
      "label": "Picker mode",
      "kind": "text",
      "type": "string",
      "description": "Picker mode: read or write.",
    },
    "include": {
      "label": "Include",
      "kind": "literal",
      "type": "array",
      "description": "Optional scope roots to include, such as flow or current.",
    },
    "detail": {
      "label": "Detail level",
      "kind": "text",
      "type": "string",
      "description": "normal or compact.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "context.hooks.js",
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
		if (!hasDefinition && !hasSource && args.name) {
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
			return ctx.contextFlowSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
