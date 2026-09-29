const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-tree-outline",
  "description": "Describes the generic authoring tree for Studio, MCP, tests, and future authoring clients.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "surface": {
      "label": "Surface",
      "kind": "text",
      "type": "string",
      "default": "frontend",
      "description": "Authoring surface. Defaults to frontend.",
    },
    "builder": {
      "label": "Builder",
      "kind": "text",
      "type": "string",
      "default": "svelte",
      "description": "Frontend builder name.",
    },
    "definition": {
      "label": "Definition",
      "kind": "literal",
      "type": "object",
      "description": "Optional FlowEngine definition object.",
    },
    "engineSource": {
      "label": "Engine source",
      "kind": "text",
      "type": "string",
      "description": "Optional FlowEngine YAML source.",
    },
    "detail": {
      "label": "Detail level",
      "kind": "text",
      "type": "string",
      "default": "compact",
      "description": "Tree detail: compact, summary or full.",
    },
    "maxDepth": {
      "label": "Maximum depth",
      "kind": "literal",
      "type": "number",
      "description": "Maximum child depth returned in compact or summary detail.",
    },
    "focusPath": {
      "label": "Focus path",
      "kind": "text",
      "type": "string",
      "description": "Optional tree path to return as the root of the response.",
    },
    "property": {
      "label": "Property",
      "kind": "text",
      "type": "string",
      "description": "Optional exact bindable property whose picker candidates should be returned in inspect mode.",
    },
    "sourceId": {
      "label": "Source id",
      "kind": "text",
      "type": "string",
      "description": "Optional exact source id used to filter picker candidates: a sequence result key (.Seq or .Seq#marker), a FullSync, action or iterator id.",
    },
    "rootPath": {
      "label": "Root path (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for focusPath.",
    },
  },
  "runtime": "rhino",
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
