const _meta = {
  "version": 1,
  "icon": "mdi:find-replace",
  "description": "Replaces literal text without interpreting the search as a regular expression.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "replace.browser.js" }
  },
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "{{ local.text }}",
      "description": "Text in which to replace literal matches."
    },
    "search": {
      "label": "Search",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Literal text to find. An empty search returns the input text unchanged."
    },
    "replacement": {
      "label": "Replacement",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Text inserted for each match."
    },
    "all": {
      "label": "Replace all",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "Replace every non-overlapping match. When false, replace only the first match."
    },
    "caseSensitive": {
      "label": "Case sensitive",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "Match letter case. Disable for case-insensitive matching."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.text",
      "description": "Scope path receiving the replaced string."
    }
  },
  "outputs": {
    "out": { "type": "string" }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "replace.hooks.js"
  },
  "tags": ["text", "replace", "literal", "portable", "axiom"]
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

  return {
    run: function (ctx, node) {
      var props = ctx.props(node);
      return replaceLiteral(
        stringValue(ctx, props.text),
        stringValue(ctx, props.search),
        stringValue(ctx, props.replacement),
        booleanValue(ctx, props.all, true),
        booleanValue(ctx, props.caseSensitive, true)
      );
    }
  };
}())
