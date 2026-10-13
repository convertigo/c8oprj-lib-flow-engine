const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:format-list-bulleted",
  "description": "Splits a text on a literal separator into a list of texts, trimmed and without empty items by default (\"a, b,\" gives [\"a\", \"b\"]).",
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
      "description": "Literal separator.",
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

  return {
    run: function (ctx, node) {
      var props = ctx.props(node);
      var value = text(ctx, props.text, "");
      var separator = text(ctx, props.separator, ",");
      var trim = flag(ctx, props.trim);
      var removeEmpty = flag(ctx, props.removeEmpty);
      if (value === "") {
        return [];
      }
      var items = separator === "" ? [value] : value.split(separator);
      var list = [];
      for (var i = 0; i < items.length; i++) {
        var item = trim ? items[i].trim() : items[i];
        if (!removeEmpty || item !== "") {
          list.push(item);
        }
      }
      return list;
    }
  };
}())
