const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:format-list-numbered",
  "description": "Returns the first item of an array or a fallback.",
  "summary": "first of {{items}}",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "implementations": {
    "backend": {
      "runtime": "rhino",
    },
    "frontend": {
      "runtime": "browser",
      "file": "first.browser.js",
    },
  },
  "properties": {
    "items": {
      "label": "Items",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Source array.",
    },
    "fallback": {
      "label": "Fallback",
      "category": "Expert",
      "kind": "value",
      "type": "unknown",
      "description": "Value returned for an empty array.",
    },
  },
  "outputs": {
    "out": {
      "type": "unknown",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "first.hooks.js",
  },
  "tags": [
    "list",
    "array",
    "first",
    "portable",
    "axiom",
  ],
}
(function () { return { run: function (ctx, node) { var p = ctx.props(node); var items = ctx.expr(p.items) || []; return items.length ? items[0] : ctx.input({ value: p.fallback }) },
		debug: {
			resolve: function (ctx, node) {
				var p = ctx.props(node),
					args = { items: ctx.expr(p.items) || [] };
				if (!args.items.length) args.fallback = ctx.input({ value: p.fallback });
				return args;
			},
			run: function (ctx, node, args) {
				return args.items.length ? args.items[0] : args.fallback;
			}
		}
	} }())
