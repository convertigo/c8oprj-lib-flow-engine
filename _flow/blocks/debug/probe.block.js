const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:bug-check-outline",
  "description": "Inspects a value while developing a Flow without changing the final result contract.",
  "summary": "probe {{label}}",
  "longDescription": "Use this as a development inspection point. Pick a Value (for example {{ local.total }}) and optionally compose a Label (for example Total for {{ input.city }}). The observation is added to trace.probes; it does not replace the Flow's final result. An optional engine Output captures the same value. Unlike log, this block records a structured observation instead of writing a Convertigo log message. Remove probes once the Flow is stable.",
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "description": "Value to inspect. Pick a source or use {{ expression }} to evaluate it; plain text stays text.",
    },
    "label": {
      "label": "Label",
      "kind": "template",
      "type": "string",
      "description": "Optional label shown in the tree and trace.",
    },
  },
  "outputs": {
    "out": {
      "type": "unknown",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "probe.hooks.js",
  },
  "tags": [
    "debug",
    "probe",
    "inspect",
    "trace",
    "development",
  ],
}

(function () {
  return {
    run: function (ctx, node) {
      var props = ctx.props(node);
      var value = ctx.input({ value: props.value });
      var probes = ctx.read("trace.probes");
      if (!probes || typeof probes.push !== "function") {
        probes = ctx.write("trace.probes", []);
      }
      probes.push({
        label: String(ctx.template(props.label || "")),
        value: value
      });
      if (ctx.outputPath(node)) {
        ctx.write(ctx.outputPath(node), value);
      }
      return value;
    }
  };
}())
