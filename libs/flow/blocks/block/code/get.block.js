const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-search-outline",
  "tags": [
    "block",
    "code",
    "flowscript"
  ],
  "description": "Reads project-local custom block code with revision info; not for standard http/list/json blocks.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Flow block name."
    },
    "includeSources": {
      "label": "includeSources",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Also include migration metadata when available."
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
      "description": "Scope path receiving block code."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			return ctx.blockCodeGet(ctx.props(node));
		}
	};
}())
