const _meta = {
  "version": 1,
  "icon": "mdi:playlist-plus",
  "tags": [
    "json",
    "array",
    "push",
    "append",
    "add"
  ],
  "description": "Pushes a value into an array stored in a scope path.",
  "longDescription": "Use path for the target array and value for the pushed content. A value containing only {{ expression }} keeps the native expression type.",
  "slots": [
    {
      "name": "nodes",
      "label": "Value",
      "inline": true
    }
  ],
  "properties": {
    "path": {
      "label": "path",
      "kind": "path",
      "mode": "write",
      "default": "result.items",
      "description": "Array scope path receiving the pushed value."
    },
    "value": {
      "label": "value",
      "kind": "value",
      "type": "unknown",
      "default": "{{ current }}",
      "description": "Value to push. Use {{ expression }} for dynamic values."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "push.hooks.js"
  },
  "children": [
    "nodes"
  ]
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var array = ctx.read(props.path);
			if (!array) {
				array = ctx.write(props.path, []);
			}
			var value = node.nodes && node.nodes.length ? ctx.runNodes(node.nodes) : ctx.input(props);
			array.push(value);
			return array;
		}
	};
}())
