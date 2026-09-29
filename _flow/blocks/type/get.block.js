const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:shape-outline",
  "description": "Reads one Flow property type descriptor.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Type name",
      "kind": "text",
      "type": "string",
      "description": "Flow property type name.",
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
			return ctx.typeGet(props.name, props);
		}
	};
}())
