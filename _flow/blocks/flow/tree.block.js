const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-tree-outline",
  "description": "Describes the virtual Flow or FlowEngine tree.",
  "properties": {
    "target": {
      "label": "Tree",
      "kind": "text",
      "type": "string",
      "description": "Tree target: flow or engine. Defaults to flow.",
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
    "engineQName": {
      "label": "Engine qualified name",
      "kind": "text",
      "type": "string",
      "description": "Engine QName used for display.",
    },
    "detail": {
      "label": "Detail level",
      "kind": "text",
      "type": "string",
      "description": "Tree detail: compact, summary or full.",
    },
    "maxDepth": {
      "label": "Maximum depth",
      "kind": "literal",
      "type": "number",
      "description": "Maximum child depth returned in compact or summary detail.",
    },
    "includeDefinition": {
      "label": "Include definition",
      "kind": "literal",
      "type": "boolean",
      "description": "Include raw node definition strings in compact or summary detail.",
    },
    "includeSource": {
      "label": "Include source",
      "kind": "literal",
      "type": "boolean",
      "description": "Include rewritten source when available.",
    },
    "includeAnalysis": {
      "label": "Include analysis",
      "kind": "literal",
      "type": "boolean",
      "description": "Include static analysis when available.",
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
    "file": "tree.hooks.js",
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
			return ctx.describeTreeSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
