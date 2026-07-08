const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:source-branch-sync",
  "description": "Applies a generic authoring mutation through the same engine/frontbuilder contract used by Studio and MCP.",
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
    "sourceFile": {
      "label": "sourceFile",
      "kind": "text",
      "type": "string",
      "description": "Canonical source file to mutate when the target is source-backed."
    },
    "sourcePath": {
      "label": "sourcePath",
      "kind": "text",
      "type": "string",
      "description": "Alias of sourceFile."
    },
    "source": {
      "label": "source",
      "kind": "text",
      "type": "string",
      "description": "Optional source content override."
    },
    "target": {
      "label": "target",
      "kind": "text",
      "type": "string",
      "description": "Mutation target when mutating non-source tree definitions."
    },
    "definition": {
      "label": "definition",
      "kind": "literal",
      "type": "object",
      "description": "Optional definition object for non-source mutations."
    },
    "mutation": {
      "label": "mutation",
      "kind": "literal",
      "type": "object",
      "description": "Single mutation to apply."
    },
    "mutations": {
      "label": "mutations",
      "kind": "literal",
      "type": "array",
      "description": "Mutations to apply in order."
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
      "description": "Scope path receiving the mutation result."
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
			return ctx.authoringMutateSource(argsFrom(ctx.props(node)));
		}
	};
}())
