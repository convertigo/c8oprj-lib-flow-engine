const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:regex",
  "description": "Tests a text against a regular expression (JavaScript syntax). out.matched tells whether it matches, out.groups holds the whole match then each captured group (an unmatched group is empty).",
  "summary": "match {{text}} with {{pattern}}",
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
      "file": "match.browser.js",
    },
  },
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Text to test. Null and undefined become an empty string.",
    },
    "pattern": {
      "label": "Pattern",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Regular expression, for example ^https://([^/]+)/. Anchor it with ^ and $ to test the whole text.",
    },
    "ignoreCase": {
      "label": "Ignore case",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Match letters regardless of their case.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "matched": {
          "type": "boolean",
        },
        "groups": {
          "type": "array",
          "items": {
            "type": "string",
          },
        },
      },
    },
  },
  "runtime": "rhino",
  "tags": [
    "text",
    "regex",
    "match",
    "portable",
  ],
}

(function () {
  function text(ctx, value) {
    var rendered = value === undefined || value === null ? "" : ctx.template(value);
    return rendered === undefined || rendered === null ? "" : String(rendered);
  }

  function matched(found) {
    if (found === null) {
      return { matched: false, groups: [] };
    }
    var groups = [];
    for (var i = 0; i < found.length; i++) {
      groups.push(found[i] === undefined || found[i] === null ? "" : String(found[i]));
    }
    return { matched: true, groups: groups };
  }

  return {
    prepareNode: function (node, helpers) {
      var props = helpers.props, resolveText = helpers.compileValue(props.text), resolvePattern = helpers.compileValue(props.pattern);
      var resolveCase = helpers.compileValue(props.ignoreCase === undefined ? false : props.ignoreCase);
      var staticPattern = typeof props.pattern === "string" && !/\$\{|\{\{/.test(props.pattern);
      var staticCase = typeof props.ignoreCase !== "string" || !/\$\{|\{\{/.test(props.ignoreCase);
      var regexp = staticPattern && staticCase ? new RegExp(props.pattern, props.ignoreCase === true || String(props.ignoreCase) === "true" ? "i" : "") : null;
      return function (ctx) {
        var value = resolveText(ctx), pattern = regexp;
        if (!pattern) {
          var spelling = resolvePattern(ctx), ignoreCase = resolveCase(ctx);
          pattern = new RegExp(spelling == null ? "" : String(spelling), ignoreCase === true || String(ignoreCase) === "true" ? "i" : "");
        }
        return matched(pattern.exec(value == null ? "" : String(value)));
      };
    },
    run: function (ctx, node) {
      var props = ctx.props(node);
      var ignoreCase = props.ignoreCase === undefined ? false : ctx.input({ value: props.ignoreCase });
      return matched(new RegExp(text(ctx, props.pattern), ignoreCase === true || String(ignoreCase) === "true" ? "i" : "").exec(text(ctx, props.text)));
    }
  };
}())
