const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:counter",
  "description": "Returns the number of items in an array.",
  "summary": "count {{items}}",
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
      "file": "count.browser.js",
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
  },
  "outputs": {
    "out": {
      "type": "integer",
    },
  },
  "runtime": "rhino",
  "tags": [
    "list",
    "array",
    "count",
    "length",
    "portable",
    "axiom",
  ],
}
(function () { return { run: function (ctx, node) { var items = ctx.expr(ctx.props(node).items) || []; return Number(items.length || 0) },
		debug: {
			resolve: function (ctx, node) {
				return { items: ctx.expr(ctx.props(node).items) || [] };
			},
			run: function (ctx, node, args) {
				return Number(args.items.length || 0);
			}
		}
	} }())
