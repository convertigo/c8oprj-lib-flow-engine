const _meta = {
  "version": 1,
  "icon": "mdi:bug-check-outline",
  "description": "Inspects a value while developing a Flow without changing the final result contract.",
  "longDescription": "Use this as a temporary probe: it evaluates value, writes it to out when out is set, and returns the same value so code-run traces can show it. Remove probes once the Flow is stable.",
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "description": "Value to inspect. Use a scope path or any Flow expression."
    },
    "label": {
      "label": "Label",
      "kind": "template",
      "type": "string",
      "description": "Optional label shown in the tree and trace."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "expert": true,
      "description": "Optional scratch scope path receiving the inspected value."
    }
  },
  "outputs": {
    "value": {
      "type": "unknown"
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "probe.hooks.js"
  },
  "tags": [
    "debug",
    "probe",
    "inspect",
    "trace",
    "development"
  ]
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
      if (props.out) {
        ctx.write(props.out, value);
      }
      return value;
    }
  };
}())
