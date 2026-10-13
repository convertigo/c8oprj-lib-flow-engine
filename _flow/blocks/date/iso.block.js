const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:clock-outline",
  "description": "Returns a date as ISO 8601 UTC text (2026-10-13T14:42:08.063Z): the current time, or a Unix time in milliseconds or a date text.",
  "summary": [
    "ISO date of {{value}}",
    "ISO date now",
  ],
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
      "file": "iso.browser.js",
    },
  },
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "description": "Unix time in milliseconds or date text. Empty for the current time.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
  "tags": [
    "date",
    "time",
    "iso",
    "timestamp",
    "portable",
  ],
}

(function () {
  function iso(value) {
    if (value === undefined || value === null || value === "") {
      return new Date().toISOString();
    }
    var date = typeof value === "number" || /^-?\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(String(value));
    return isNaN(date.getTime()) ? "" : date.toISOString();
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node);
      return iso(props.value === undefined ? undefined : ctx.input({ value: props.value }));
    }
  };
}())
