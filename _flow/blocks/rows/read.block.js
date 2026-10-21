const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:table",
  "description": "Reads one bounded JSON path on every element of an array, including JSON text elements.",
  "longDescription": "One output per input element, unless skipMissing is true. Wildcards return a nested array per element. JSON text is parsed once per element (not a streaming parser). Invalid JSON and malformed paths fail explicitly. No eval and no inherited-property traversal.",
  "summary": "read {{path}} from {{rows}}",
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
      "file": "read.browser.js"
    }
  },
  "tags": [
    "rows",
    "array",
    "table",
    "bulk",
    "portable",
    "read"
  ],
  "properties": {
    "rows": {
      "label": "Rows",
      "kind": "expression",
      "type": "array",
      "description": "Whole input array. Evaluated once per call; no Flow node is run per row.",
      "default": "local.rows",
      "items": {
        "type": "any"
      }
    },
    "path": {
      "label": "JSON path",
      "kind": "value",
      "type": "string",
      "description": "$.key, $[0], $[\"literal.key\"], $.items[*].id; relative dotted paths accepted. No scripts, filters or recursive descent.",
      "default": "$"
    },
    "defaultValue": {
      "label": "Missing value",
      "kind": "value",
      "type": "unknown",
      "description": "Used only for a missing path. Explicit null, false, 0 and empty text are preserved.",
      "default": null
    },
    "skipMissing": {
      "label": "Skip missing",
      "kind": "value",
      "type": "boolean",
      "description": "Omit missing paths instead of using defaultValue. Wildcard with no matches returns [].",
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
        "type": "any"
      }
    }
  },
  "hooks": {
    "file": "read.hooks.js"
  }
};

(function () {
  return {run: function(ctx, node) {
    var props=ctx.props(node), input={};
    Object.keys(props).forEach(function(k) { input[k]=k === "rows" ? ctx.expr(props[k]) : ctx.template(props[k]); });
    return ctx.lib("rows").read(input, {canContinue:function(){ return ctx.canContinue(); }});
  }};
}())
