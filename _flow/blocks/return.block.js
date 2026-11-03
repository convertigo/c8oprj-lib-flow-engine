const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:keyboard-return",
  "description": "Stops the Flow and returns a value. Without this block, result is returned implicitly.",
  "summary": "return {{value}}",
  "longDescription": "Most flows do not need this block because result is returned at the end. Use it only to return early from a branch.",
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "default": "${result}",
      "description": "Value returned by the flow. Write an expression such as local.result, a quoted text or a template literal.",
    },
  },
  "runtime": "rhino",
  "outputs": { "out": { "type": "unknown", "hidden": true } },
  "hooks": {
    "file": "return.hooks.js",
  },
}

(function () {
	return {
		stateless: true,
		prepareNode: function (node, helpers) {
			var resolve = helpers.props.value !== undefined ? helpers.compileValue(helpers.props.value) : null;
			var runner = function (ctx) { return ctx.returnValue(resolve ? resolve(ctx) : ctx.read("result")); };
			return helpers.debug ? helpers.debug(runner,
				function (ctx) { return { value: resolve ? resolve(ctx) : ctx.read("result") }; },
				function (ctx, _node, args) { return ctx.returnValue(args.value); }) : runner;
		},
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.returnValue(ctx.input(props, ctx.read("result")));
		}
	};
}())
