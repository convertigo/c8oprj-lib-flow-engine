const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:table",
  "description": "Formats a whole row array into typed value/text cells in one execution.",
  "longDescription": "Each formatted cell is {value, text}, plus numeric when requested. Null/missing becomes {value:null,text:nullText}. Values retain their JSON type. No arbitrary expressions or block calls in column descriptors. Invalid numbers, booleans and strict ISO dates fail explicitly. Literal names (including dots) stay literal; use path for nested JSON. A domain-specific HTML profile, including Baserow HTML, belongs in its provider library.",
  "summary": "format cells of {{rows}}",
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
      "file": "formatCells.browser.js"
    }
  },
  "tags": [
    "rows",
    "array",
    "table",
    "bulk",
    "portable",
    "formatCells"
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
      "label": "Column schema",
      "kind": "value",
      "type": "array",
      "description": "Ordered column descriptors: name, optional key/path, type (text/number/integer/boolean/date/datetime/json), decimals, nullText, trueText/falseText, pattern, locale and timeZone. Date defaults: dd/MM/yyyy, fr-FR, UTC."
    },
    "keepColumns": {
      "label": "Columns",
      "kind": "value",
      "type": "array",
      "description": "Literal columns copied first without cell formatting, e.g. [\"id\"].",
      "default": [],
      "items": {
        "type": "string"
      }
    },
    "valuesOnly": {
      "label": "Values only",
      "kind": "value",
      "type": "boolean",
      "description": "Return raw values instead of cells; column selection and bounds still apply.",
      "default": false
    },
    "escapeHtml": {
      "label": "Escape HTML",
      "kind": "value",
      "type": "boolean",
      "description": "Escape &, <, >, double and single quotes in text. Text never contains generated HTML markup.",
      "default": false
    },
    "includeNumeric": {
      "label": "Numeric flag",
      "kind": "value",
      "type": "boolean",
      "description": "Include a strict decimal-text numeric flag in each cell.",
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
    "file": "formatCells.hooks.js"
  }
};

(function () {
  return {run: function(ctx, node) {
    var props=ctx.props(node), input={};
    Object.keys(props).forEach(function(k) { input[k]=k === "rows" ? ctx.expr(props[k]) : ctx.template(props[k]); });
    return ctx.lib("rows").formatCells(input, {canContinue:function(){ return ctx.canContinue(); }});
  }};
}())
