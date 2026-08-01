const _meta = {
  "version": 1,
  "icon": "mdi:timer-outline",
  "description": "Formats a duration in milliseconds as a clock value.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "format.browser.js" }
  },
  "properties": {
    "milliseconds": {
      "label": "Milliseconds",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "Duration to format in milliseconds."
    },
    "showHours": {
      "label": "Show hours",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Always includes an hours field when enabled."
    },
    "fractionDigits": {
      "label": "Fraction digits",
      "kind": "value",
      "type": "integer",
      "default": 1,
      "description": "Number of millisecond digits, from 0 to 3."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.duration",
      "description": "Path receiving the formatted duration."
    }
  },
  "outputs": {
    "out": { "type": "string" }
  },
  "runtime": "rhino",
  "tags": ["duration", "timer", "stopwatch", "format", "portable", "axiom"]
}

(function () {
  function pad(value, size) {
    var text = String(value);
    while (text.length < size) text = "0" + text;
    return text;
  }

  function formatDuration(input) {
    var total = Math.max(0, Number(input.milliseconds) || 0);
    var digits = Math.max(0, Math.min(3, Math.floor(Number(input.fractionDigits))));
    if (!isFinite(digits)) digits = 1;
    var wholeSeconds = Math.floor(total / 1000);
    var hours = Math.floor(wholeSeconds / 3600);
    var minutes = Math.floor(wholeSeconds / 60) % 60;
    var seconds = wholeSeconds % 60;
    var value = (input.showHours || hours > 0 ? pad(hours, 2) + ":" : "")
      + pad(input.showHours || hours > 0 ? minutes : Math.floor(wholeSeconds / 60), 2)
      + ":" + pad(seconds, 2);
    if (digits > 0) {
      value += "." + pad(Math.floor(total % 1000), 3).substring(0, digits);
    }
    return value;
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      return formatDuration({
        milliseconds: ctx.input({ value: props.milliseconds }),
        showHours: ctx.input({ value: props.showHours }),
        fractionDigits: ctx.input({ value: props.fractionDigits })
      })
    }
  }
}())
