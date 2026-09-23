const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:shape-outline",
  "description": "Reads one Flow property type descriptor.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Flow property type name.",
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
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
