const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:table",
  "description": "Groups whole arrays and computes count, sum, avg, min and max without per-row Flow nodes.",
  "longDescription": "One row per group in first-occurrence order. Copies the first row of each group and writes each aggregate at its key (replacing that column when named). Aggregate values are raw; use rows.formatCells afterwards. count and sum with no values return 0; avg/min/max with no values return null. No implicit locale-dependent numeric parsing.",
  "summary": "group {{rows}} by {{groupColumns}}",
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
      "file": "group.browser.js"
    }
  },
  "tags": [
    "rows",
    "array",
    "table",
    "bulk",
    "portable",
    "group"
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
    "groupColumns": {
      "label": "Columns",
      "kind": "value",
      "type": "array",
      "description": "Literal column names or explicit $.nested paths. Empty forms one global group; empty input returns [].",
      "default": [],
      "items": {
        "type": "string"
      }
    },
    "aggregations": {
      "label": "Aggregations",
      "kind": "value",
      "type": "array",
      "description": "Ordered {type,column,key} descriptors. count counts rows; sum/avg require finite numbers or numeric text; min/max require consistently typed numbers or text.",
      "default": []
    },
    "valueKey": {
      "label": "Cell value key",
      "kind": "value",
      "type": "string",
      "description": "Empty reads raw values; \"value\" reads cells. Aggregate outputs remain raw values.",
      "default": ""
    },
    "skipInvalid": {
      "label": "Skip invalid aggregates",
      "kind": "value",
      "type": "boolean",
      "description": "Explicit opt-in to skip nonnumeric/mixed aggregate values. Null, missing and empty text are always skipped.",
      "default": false
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
    "file": "group.hooks.js"
  }
};

(function () {
  return {run: function(ctx, node) {
    var props=ctx.props(node), input={};
    Object.keys(props).forEach(function(k) { input[k]=k === "rows" ? ctx.expr(props[k]) : ctx.template(props[k]); });
    return ctx.lib("rows").group(input, {canContinue:function(){ return ctx.canContinue(); }});
  }};
}())
