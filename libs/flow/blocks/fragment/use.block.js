const _meta = {
  "version": 1,
  "icon": "mdi:folder-sync-outline",
  "tags": [
    "composition"
  ],
  "description": "Expands and runs a reusable Flow fragment in the current scopes.",
  "longDescription": "A fragment is stored in libs/flow/fragments/<name>.fragment.yaml and behaves like the nodes were written inline. It has closure-style access to input, config, local, result and current.",
  "slots": [
    {
      "name": "nodes",
      "label": "Fragment",
      "inline": true
    }
  ],
  "properties": {
    "fragment": {
      "label": "fragment",
      "kind": "text",
      "type": "string",
      "description": "Project Flow fragment to expand inline."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "use.hooks.js"
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
			return ctx.runNodes(node.nodes || []);
		}
	};
}())
