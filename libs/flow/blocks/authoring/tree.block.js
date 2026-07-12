const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-tree-outline",
  "description": "Describes the generic authoring tree for Studio, MCP, tests, and future authoring clients.",
  "properties": {
    "surface": {
      "label": "surface",
      "kind": "text",
      "type": "string",
      "default": "frontend",
      "description": "Authoring surface. Defaults to frontend."
    },
    "builder": {
      "label": "builder",
      "kind": "text",
      "type": "string",
      "default": "svelte",
      "description": "Frontend builder name."
    },
    "definition": {
      "label": "definition",
      "kind": "literal",
      "type": "object",
      "description": "Optional FlowEngine definition object."
    },
    "engineSource": {
      "label": "engineSource",
      "kind": "text",
      "type": "string",
      "description": "Optional FlowEngine YAML source."
    },
    "detail": {
      "label": "detail",
      "kind": "text",
      "type": "string",
      "default": "compact",
      "description": "Tree detail: compact, summary or full."
    },
    "maxDepth": {
      "label": "maxDepth",
      "kind": "literal",
      "type": "number",
      "description": "Maximum child depth returned in compact or summary detail."
    },
    "focusPath": {
      "label": "focusPath",
      "kind": "text",
      "type": "string",
      "description": "Optional tree path to return as the root of the response."
    },
    "rootPath": {
      "label": "rootPath",
      "kind": "text",
      "type": "string",
      "description": "Alias for focusPath."
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
      "description": "Scope path receiving the authoring tree."
    }
  },
  "runtime": "rhino"
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

	return {
		run: function (ctx, node) {
			return ctx.authoringTreeSource(argsFrom(ctx.props(node)));
		}
	};
}())
