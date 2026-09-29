const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:palette-outline",
  "description": "Computes the generic authoring palette for a focus node and returns diagnostics when it is empty.",
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
    "focusPath": {
      "label": "Focus path",
      "kind": "text",
      "type": "string",
      "description": "Virtual tree path of the focused node.",
    },
    "parentPath": {
      "label": "Parent path",
      "kind": "text",
      "type": "string",
      "description": "Qualified parent path returned by the authoring tree. MCP clients should prefer this over project plus focusPath.",
    },
    "position": {
      "label": "Position",
      "kind": "text",
      "type": "string",
      "default": "inside",
      "description": "Insertion position: inside, before or after.",
    },
    "query": {
      "label": "Query",
      "kind": "text",
      "type": "string",
      "description": "Optional palette text filter.",
    },
    "detail": {
      "label": "Detail level",
      "kind": "text",
      "type": "string",
      "description": "Optional response detail level, for example compact.",
    },
    "limit": {
      "label": "Limit",
      "kind": "literal",
      "type": "number",
      "description": "Optional maximum number of returned palette items. The eligible count remains available for diagnostics.",
    },
    "applyFallback": {
      "label": "Apply fallback",
      "kind": "literal",
      "type": "boolean",
      "description": "Explicitly apply a parent palette fallback when available.",
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
			return ctx.authoringPaletteSource(argsFrom(ctx.props(node)));
		}
	};
}())
