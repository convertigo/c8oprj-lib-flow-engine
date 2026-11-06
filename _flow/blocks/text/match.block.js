const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:regex",
  "description": "Tests a text against a regular expression (JavaScript syntax), under an execution budget. out.matched tells whether it matches, out.groups holds the whole match then each captured group (an unmatched group is empty); with the g flag, every whole match. A pattern of more than 500 characters, an unsupported syntax or flag gives TEXT_PATTERN_INVALID, a text of more than 100000 characters TEXT_INPUT_TOO_LONG, too much backtracking TEXT_PATTERN_TIMEOUT.",
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
      "description": "Regular expression in JavaScript syntax, for example ^https://([^/]+)/, at most 500 characters. Anchor it with ^ and $ to test the whole text.",
    },
    "ignoreCase": {
      "label": "Ignore case",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Match letters regardless of their case.",
    },
    "flags": {
      "label": "Flags",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Letters among g (every match), i (ignore case), m (^ and $ at each line) and s (. matches line ends).",
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

  function resolve(ctx, node) {
    var props = ctx.props(node);
    var ignoreCase = props.ignoreCase === undefined ? false : ctx.input({ value: props.ignoreCase });
    var flags = text(ctx, props.flags);
    if ((ignoreCase === true || String(ignoreCase) === "true") && flags.indexOf("i") < 0) {
      flags += "i";
    }
    return { text: text(ctx, props.text), pattern: text(ctx, props.pattern), flags: flags };
  }

  // the pattern is run by lib/text-pattern.js: java.util.regex under a budget of reads of the text
  function run(ctx, node, args) {
    var patterns = ctx.lib("text-pattern");
    try {
      return patterns.match(patterns.compile(args.pattern, args.flags), args.text);
    } catch (e) {
      var failure = patterns.failure(e);
      if (failure) {
        return ctx.throwFlow({ code: failure.textPatternCode, message: "text.match: " + failure.message, hint: failure.hint, status: failure.status }, node);
      }
      throw e;
    }
  }

  return {
    // the templates are compiled once for the node; the pattern is compiled once for its spelling (lib/text-pattern.js)
    prepareNode: function (node, helpers) {
      var props = helpers.props, resolveText = helpers.compileValue(props.text), resolvePattern = helpers.compileValue(props.pattern);
      var resolveCase = helpers.compileValue(props.ignoreCase === undefined ? false : props.ignoreCase);
      var resolveFlags = props.flags === undefined || props.flags === null ? null : helpers.compileValue(props.flags);
      var resolveArgs = function (ctx) {
        var value = resolveText(ctx), pattern = resolvePattern(ctx), ignoreCase = resolveCase(ctx), flags = resolveFlags ? resolveFlags(ctx) : "";
        flags = flags === undefined || flags === null ? "" : String(flags);
        if ((ignoreCase === true || String(ignoreCase) === "true") && flags.indexOf("i") < 0) {
          flags += "i";
        }
        return { text: value == null ? "" : String(value), pattern: pattern == null ? "" : String(pattern), flags: flags };
      };
      var runner = function (ctx, runNode) {
        return run(ctx, runNode || node, resolveArgs(ctx));
      };
      return helpers.debug ? helpers.debug(runner, resolveArgs, function (ctx, debugNode, args) {
        return run(ctx, debugNode || node, args);
      }) : runner;
    },
    run: function (ctx, node) {
      return run(ctx, node, resolve(ctx, node));
    }
  };
}())
