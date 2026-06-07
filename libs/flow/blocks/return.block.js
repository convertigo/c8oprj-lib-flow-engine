const _meta = {
  "version": 1,
  "icon": "mdi:keyboard-return",
  "description": "Stops the Flow and returns a value. Without this block, result is returned implicitly.",
  "longDescription": "Most flows do not need this block because result is returned at the end. Use it only to return early from a branch.",
  "properties": {
    "value": {
      "label": "value",
      "kind": "value",
      "type": "unknown",
      "default": "{{ result }}",
      "description": "Value returned by the flow. Use {{ expression }} for dynamic values."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "return.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.returnValue(ctx.input(props, ctx.read("result")));
		}
	};
}())
