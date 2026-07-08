const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:palette-outline",
  "description": "Computes the generic authoring palette for a focus node and returns diagnostics when it is empty.",
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
    "focusPath": {
      "label": "focusPath",
      "kind": "text",
      "type": "string",
      "description": "Virtual tree path of the focused node."
    },
    "position": {
      "label": "position",
      "kind": "text",
      "type": "string",
      "default": "inside",
      "description": "Insertion position: inside, before or after."
    },
    "query": {
      "label": "query",
      "kind": "text",
      "type": "string",
      "description": "Optional palette text filter."
    },
    "applyFallback": {
      "label": "applyFallback",
      "kind": "literal",
      "type": "boolean",
      "description": "Explicitly apply a parent palette fallback when available."
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
      "description": "Scope path receiving the palette response."
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
			return ctx.authoringPaletteSource(argsFrom(ctx.props(node)));
		}
	};
}())
