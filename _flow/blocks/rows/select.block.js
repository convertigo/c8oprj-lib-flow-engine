const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:table",
  "description": "Selects, orders and renames columns across a whole array in one execution.",
  "longDescription": "Missing fields are omitted. Input objects are not modified. Keys such as __proto__ are preserved as data. Column strings beginning with $ use JSON paths; all other strings, including dots, are literal column names.",
  "summary": "select columns of {{rows}}",
  "targets": [
    "backend",
    "frontend"
  ],
  "effects": [],
  "runtime": "rhino",
  "uses": [
    "rows"
  ],
  "implementations": {
    "backend": {
      "runtime": "rhino"
    },
    "frontend": {
      "runtime": "browser",
      "file": "select.browser.js"
    }
  },
  "tags": [
    "rows",
    "array",
    "table",
    "bulk",
    "portable",
    "select"
  ],
  "properties": {
    "rows": {
      "label": "Rows",
      "kind": "expression",
      "type": "array",
      "description": "Whole input array. Evaluated once per call; no Flow node is run per row.",
      "default": "local.rows",
      "items": {
        "type": "object"
      }
    },
    "firstColumns": {
      "label": "Columns",
      "kind": "value",
      "type": "array",
      "description": "Columns copied first, e.g. [\"id\",\"order\"].",
      "default": [],
      "items": {
        "type": "string"
      }
    },
    "columns": {
      "label": "Selected columns",
      "kind": "value",
      "type": "array",
      "description": "When supplied, only firstColumns plus these columns are kept (even []); omit to keep the rest. Strings are literal keys, or {path:\"$.customer.name\",key:\"name\"} for nested projection."
    },
    "columnsOrder": {
      "label": "Columns",
      "kind": "value",
      "type": "array",
      "description": "When columns is omitted, preferred order before remaining columns.",
      "default": [],
      "items": {
        "type": "string"
      }
    },
    "rename": {
      "label": "Rename",
      "kind": "value",
      "type": "object",
      "description": "Literal source-key to output-key map. Conflicting destinations are refused.",
      "default": {}
    },
    "maxRows": {
      "label": "Maximum rows",
      "kind": "value",
      "type": "integer",
      "description": "Maximum input rows, 1..1000000; excess fails with ROWS_LIMIT_EXCEEDED.",
      "default": 100000
    },
    "maxCells": {
      "label": "Maximum cell work",
      "kind": "value",
      "type": "integer",
      "description": "Maximum row × column work or wildcard expansion, 1..10000000.",
      "default": 1000000
    }
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "hooks": {
    "file": "select.hooks.js"
  }
};

(function () {
  return {run: function(ctx, node) {
    var props=ctx.props(node), input={};
    Object.keys(props).forEach(function(k) { input[k]=k === "rows" ? ctx.expr(props[k]) : ctx.template(props[k]); });
    return ctx.lib("rows").select(input, {canContinue:function(){ return ctx.canContinue(); }});
  }};
}())
