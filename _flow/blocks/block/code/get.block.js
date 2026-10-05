const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-outline",
  "tags": [
    "block",
    "code",
    "flowscript",
  ],
  "description": "Reads project-local custom block code with revision info; not for standard http/list/json blocks.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Block name",
      "kind": "text",
      "type": "string",
      "description": "Flow block name.",
    },
    "target": {
      "label": "Implementation",
      "kind": "text",
      "type": "string",
      "default": "backend",
      "description": "Implementation target: backend or frontend.",
    },
    "includeSources": {
      "label": "Include sources",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Also include the code file path and the implementation source.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js",
  },
}

(function () {
	return {
		run: function (ctx, node) {
			return ctx.blockCodeGet(ctx.props(node));
		}
	};
}())
