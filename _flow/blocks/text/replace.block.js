const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:find-replace",
  "description": "Replaces literal text, or with regex: true the matches of a regular expression (JavaScript syntax, $1 $& $<name> in the replacement, under the execution budget of text.match on the server; in a page the browser runs its native RegExp without a budget: no nested quantifier such as `(a+)+` or `(a|a)*` there, never a pattern over data written by other users, and any check that guards data runs again in the server Flow).",
  "summary": "replace {{search}} by {{replacement}} in {{text}}",
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
      "file": "replace.browser.js",
    },
  },
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "${local.text}",
      "description": "Text in which to replace literal matches.",
    },
    "search": {
      "label": "Search",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Literal text to find. An empty search returns the input text unchanged. With regex: true, a regular expression (JavaScript syntax, at most 500 characters).",
    },
    "replacement": {
      "label": "Replacement",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Text inserted for each match.",
    },
    "all": {
      "label": "Replace all",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "Replace every non-overlapping match. When false, replace only the first match.",
    },
    "caseSensitive": {
      "label": "Case sensitive",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "Match letter case. Disable for case-insensitive matching.",
    },
    "regex": {
      "label": "Regular expression",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Read search as a regular expression: replacement then takes $1, $&, $<name> and $$ as in JavaScript; all and caseSensitive keep their meaning.",
    },
    "flags": {
      "label": "Flags",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "With regex: true, letters among i, m, s (and g, which is all: true).",
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
      "type": "string",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "replace.hooks.js",
  },
  "tags": [
    "text",
    "replace",
    "literal",
    "regex",
    "portable",
    "axiom",
  ],
}

(function () {
  function stringValue(ctx, value) {
    if (value === undefined || value === null) {
      return "";
    }
    var rendered = ctx.template(value);
    return rendered === undefined || rendered === null ? "" : String(rendered);
  }

  function booleanValue(ctx, value, fallback) {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    var resolved = ctx.input({ value: value }, fallback);
    if (typeof resolved === "boolean") {
      return resolved;
    }
    var lowered = String(resolved).toLowerCase();
    if (lowered === "false" || lowered === "0" || lowered === "no") {
      return false;
    }
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }

  function replaceLiteral(text, search, replacement, all, caseSensitive) {
    if (search === "") {
      return text;
    }
    var haystack = caseSensitive ? text : text.toLowerCase();
    var needle = caseSensitive ? search : search.toLowerCase();
    var start = 0;
    var match = haystack.indexOf(needle, start);
    if (match < 0) {
      return text;
    }
    var result = "";
    while (match >= 0) {
      result += text.substring(start, match) + replacement;
      start = match + search.length;
      if (!all) {
        break;
      }
      match = haystack.indexOf(needle, start);
    }
    return result + text.substring(start);
  }

  // with regex: true, the pattern runs in lib/text-pattern.js (java.util.regex under a budget of reads of the text)
  function replaceRegex(ctx, node, args) {
    var patterns = ctx.lib("text-pattern");
    try {
      // g is all: true; caseSensitive: false is i
      var all = args.all || args.flags.indexOf("g") >= 0, flags = args.flags.replace(/g/g, "");
      if (!args.caseSensitive && flags.indexOf("i") < 0) {
        flags += "i";
      }
      return patterns.replace(patterns.compile(args.search, flags), args.text, args.replacement, all);
    } catch (e) {
      var failure = patterns.failure(e);
      if (failure) {
        return ctx.throwFlow({ code: failure.textPatternCode, message: "text.replace: " + failure.message, hint: failure.hint, status: failure.status }, node);
      }
      throw e;
    }
  }

  function resolve(ctx, node) {
    var p = ctx.props(node);
    return {
      text: stringValue(ctx, p.text),
      search: stringValue(ctx, p.search),
      replacement: stringValue(ctx, p.replacement),
      all: booleanValue(ctx, p.all, true),
      caseSensitive: booleanValue(ctx, p.caseSensitive, true),
      regex: p.regex === true || String(p.regex) === "true",
      flags: p.regex === true || String(p.regex) === "true" ? stringValue(ctx, p.flags) : ""
    };
  }

  function run(ctx, node, args) {
    return args.regex
      ? replaceRegex(ctx, node, args)
      : replaceLiteral(args.text, args.search, args.replacement, args.all, args.caseSensitive);
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
