const _meta = {
  "version": 1,
  "icon": "mdi:counter",
  "description": "Adds the numeric values in an array.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "sum.browser.js" }
  },
  "properties": {
    "items": {
      "label": "Items",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array of numeric values. Non-numeric values are ignored."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.total",
      "description": "Path receiving the total."
    }
  },
  "outputs": { "out": { "type": "number" } },
  "runtime": "rhino",
  "tags": ["list", "array", "sum", "total", "number", "portable", "axiom"]
}

(function () {
  return {
    run: function (ctx, node) {
      var items = ctx.expr(ctx.props(node).items) || [];
      var total = 0;
      for (var i = 0; i < items.length; i++) {
        var value = Number(items[i]);
        if (!isNaN(value)) {
          total += value;
        }
      }
      return total;
    }
  };
}())
