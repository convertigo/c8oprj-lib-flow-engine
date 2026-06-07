const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-tree-outline",
  "description": "Describes the virtual Flow or FlowEngine tree.",
  "properties": {
    "target": {
      "label": "target",
      "kind": "text",
      "type": "string",
      "description": "Tree target: flow or engine. Defaults to flow."
    },
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow sidecar name."
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
    "engineSource": {
      "label": "engineSource",
      "kind": "text",
      "type": "string",
      "description": "FlowEngine YAML source."
    },
    "engineQName": {
      "label": "engineQName",
      "kind": "text",
      "type": "string",
      "description": "Engine QName used for display."
    },
    "detail": {
      "label": "detail",
      "kind": "text",
      "type": "string",
      "description": "Tree detail: compact, summary or full."
    },
    "maxDepth": {
      "label": "maxDepth",
      "kind": "literal",
      "type": "number",
      "description": "Maximum child depth returned in compact or summary detail."
    },
    "includeDefinition": {
      "label": "includeDefinition",
      "kind": "literal",
      "type": "boolean",
      "description": "Include raw node definition strings in compact or summary detail."
    },
    "includeSource": {
      "label": "includeSource",
      "kind": "literal",
      "type": "boolean",
      "description": "Include rewritten source when available."
    },
    "includeAnalysis": {
      "label": "includeAnalysis",
      "kind": "literal",
      "type": "boolean",
      "description": "Include static analysis when available."
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
      "description": "Scope path receiving the virtual tree."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "tree.hooks.js"
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
