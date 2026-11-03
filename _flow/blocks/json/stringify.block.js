const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:code-json",
  "description": "Serializes a native value as JSON text.",
  "summary": "stringify {{value}}",
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
      "file": "stringify.browser.js",
    },
  },
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "default": "${local.value}",
      "description": "Value to serialize as JSON.",
    },
    "pretty": {
      "label": "Pretty print",
      "category": "Expert",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Write indented JSON when true.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "stringify.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		prepareNode: function (node, helpers) {
			var resolve = helpers.compileValue(helpers.props.value), pretty = helpers.props.pretty === true ? 2 : 0;
			var runner = function (ctx) { return JSON.stringify(resolve(ctx), null, pretty); };
			return helpers.debug ? helpers.debug(runner,
				function (ctx) { return { value: resolve(ctx), pretty: pretty > 0 }; },
				function (_ctx, _node, args) { return JSON.stringify(args.value, null, pretty); }) : runner;
		},
		run: function (ctx, node) {
			var props = ctx.props(node);
			return JSON.stringify(ctx.input(props), null, props.pretty === true ? 2 : 0);
		}
	};
}())
