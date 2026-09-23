const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:source-branch",
  "tags": [
    "control",
  ],
  "description": "Runs then when condition is truthy, else otherwise.",
  "summary": "if {{condition}}",
  "slots": [
    {
      "name": "then",
      "label": "Then",
      "acceptsFrom": "parentSlot",
      "scope": "caller",
      "description": "Runs in the caller scope when the condition is truthy.",
    },
    {
      "name": "else",
      "label": "Else",
      "acceptsFrom": "parentSlot",
      "scope": "caller",
      "description": "Runs in the caller scope when the condition is falsy.",
    },
  ],
  "properties": {
    "condition": {
      "kind": "expression",
      "type": "boolean",
      "default": "true",
      "description": "Boolean expression deciding which branch runs.",
    },
  },
  "runtime": "rhino",
  "outputs": { "out": { "type": "unknown", "hidden": true } },
  "hooks": {
    "file": "if.hooks.js",
  },
  "children": [
    "then",
    "else",
  ],
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		prepareNode: function (node, helpers) {
			var condition = helpers.compileExpression(helpers.props.condition);
			return function (ctx, runNode) {
				var ok = !!condition(ctx);
				return ctx.runNodes(ok ? (runNode.then || []) : (runNode["else"] || []));
			};
		},
		run: function (ctx, node) {
			var props = ctx.props(node);
			var ok = !!ctx.expr(props.condition);
			return ctx.runNodes(ok ? (node.then || []) : (node["else"] || []));
		}
	};
}())
