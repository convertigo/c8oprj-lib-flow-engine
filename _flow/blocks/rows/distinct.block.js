const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:table",
  "description": "Keeps the first row of each distinct column-value tuple in one execution.",
  "longDescription": "Stable first-occurrence order. Composite keys are collision-safe JSON tuples, not separator-joined strings. No cross-call result cache; input rows are not mutated. Nested values can be shared with input, as with list.take.",
  "summary": "distinct {{rows}} by {{columns}}",
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
      "file": "distinct.browser.js"
    }
  },
  "tags": [
    "rows",
    "array",
    "table",
    "bulk",
    "portable",
    "distinct"
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
    "columns": {
      "label": "Columns",
      "kind": "value",
      "type": "array",
      "description": "Literal column names or explicit $.nested paths. Empty keeps all rows. Equality is structural and type-sensitive; object key order does not matter; missing and null are equal.",
      "default": [],
      "items": {
        "type": "string"
      }
    },
    "valueKey": {
      "label": "Cell value key",
      "kind": "value",
      "type": "string",
      "description": "Empty reads raw column values; \"value\" reads value/text cells.",
      "default": ""
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
      },
      "x-flow-same-as": "rows"
    }
  },
  "hooks": {
    "file": "distinct.hooks.js"
  }
};

(function () {
  return {run: function(ctx, node) {
    var props=ctx.props(node), input={};
    Object.keys(props).forEach(function(k) { input[k]=k === "rows" ? ctx.expr(props[k]) : ctx.template(props[k]); });
    return ctx.lib("rows").distinct(input, {canContinue:function(){ return ctx.canContinue(); }});
  }};
}())
