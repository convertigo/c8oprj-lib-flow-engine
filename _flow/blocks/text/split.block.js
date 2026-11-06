const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:format-list-bulleted",
  "description": "Splits a text on a literal separator, or with regex: true on a regular expression (JavaScript syntax, captured groups included, under the execution budget of text.match), into a list of texts, trimmed and without empty items by default (\"a, b,\" gives [\"a\", \"b\"]).",
  "summary": "split {{text}} on {{separator}}",
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
      "file": "split.browser.js",
    },
  },
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Text to split. Null, undefined and empty text give an empty list.",
    },
    "separator": {
      "label": "Separator",
      "kind": "template",
      "type": "string",
      "default": ",",
      "description": "Literal separator; with regex: true, a regular expression (JavaScript syntax, at most 500 characters).",
    },
    "trim": {
      "label": "Trim items",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "Remove the whitespace around each item.",
    },
    "removeEmpty": {
      "label": "Remove empty items",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "Drop the items that are empty (after trimming).",
    },
    "regex": {
      "label": "Regular expression",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Read separator as a regular expression, as String.prototype.split does (set trim and removeEmpty to false for its exact items).",
    },
    "flags": {
      "label": "Flags",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "With regex: true, letters among i, m, s (g is ignored, as in JavaScript).",
    },
    "dynamicPattern": {
      "label": "Pattern from data",
      "category": "Expert",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "With regex: true, allow a pattern built from data in a Flow callable over HTTP. It still runs under the execution budget.",
    },
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "string",
      },
    },
  },
  "runtime": "rhino",
  "tags": [
    "text",
    "split",
    "list",
    "regex",
    "portable",
  ],
}

(function () {
  function text(ctx, value, fallback) {
    var rendered = value === undefined || value === null ? fallback : ctx.template(value);
    return rendered === undefined || rendered === null ? "" : String(rendered);
  }

  function flag(ctx, value) {
    if (value === undefined || value === null || value === "") {
      return true;
    }
    var resolved = ctx.input({ value: value });
    return !(resolved === false || String(resolved) === "false");
  }

  function resolve(ctx, node) {
    var p = ctx.props(node), regex = p.regex === true || String(p.regex) === "true";
    return {
      text: text(ctx, p.text, ""),
      separator: text(ctx, p.separator, ","),
      trim: flag(ctx, p.trim),
      removeEmpty: flag(ctx, p.removeEmpty),
      regex: regex,
      flags: regex ? text(ctx, p.flags, "") : ""
    };
  }

  // with regex: true, the pattern runs in lib/text-pattern.js (java.util.regex under a budget of reads of the text)
  function items(ctx, node, args) {
    if (!args.regex) {
      return args.text === "" ? [] : args.separator === "" ? [args.text] : args.text.split(args.separator);
    }
    var patterns = ctx.lib("text-pattern");
    try {
      return patterns.split(patterns.compile(args.separator, args.flags.replace(/g/g, "")), args.text);
    } catch (e) {
      var failure = patterns.failure(e);
      if (failure) {
        return ctx.throwFlow({ code: failure.textPatternCode, message: "text.split: " + failure.message, hint: failure.hint, status: failure.status }, node);
      }
      throw e;
    }
  }

  function run(ctx, node, args) {
    var found = items(ctx, node, args), list = [];
    for (var i = 0; i < found.length; i++) {
      var item = args.trim ? found[i].trim() : found[i];
      if (!args.removeEmpty || item !== "") {
        list.push(item);
      }
    }
    return list;
  }

  return {
    run: function (ctx, node) {
      return run(ctx, node, resolve(ctx, node));
    },
    debug: {
      resolve: resolve,
      run: run
    }
  };
}())
