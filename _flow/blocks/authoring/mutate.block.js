const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:source-branch-sync",
  "description": "Applies a generic authoring mutation through the same engine/frontbuilder contract used by Studio and MCP.",
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
    "sourceFile": {
      "label": "Source file",
      "kind": "text",
      "type": "string",
      "description": "Canonical source file to mutate when the target is source-backed.",
    },
    "sourcePath": {
      "label": "Source path (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias of sourceFile.",
    },
    "source": {
      "label": "Source",
      "kind": "text",
      "type": "string",
      "description": "Optional source content override.",
    },
    "target": {
      "label": "Mutation target",
      "kind": "text",
      "type": "string",
      "description": "Mutation target when mutating non-source tree definitions.",
    },
    "definition": {
      "label": "Definition",
      "kind": "literal",
      "type": "object",
      "description": "Optional definition object for non-source mutations.",
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
			return ctx.authoringMutateSource(argsFrom(ctx.props(node)));
		}
	};
}())
