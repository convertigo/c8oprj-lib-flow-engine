const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:sitemap",
  "description": "Reads one project Flow.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow name.",
    },
    "flowName": {
      "label": "Flow name (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for name.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.flowGet(props.name || props.flowName || prop(node, "name"), props);
		}
	};
}())
