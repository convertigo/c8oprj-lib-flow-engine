const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-outline",
  "description": "Reads one Flow block as a logical descriptor plus implementation unit.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Block name",
      "kind": "text",
      "type": "string",
      "description": "Flow block name.",
    },
    "detail": {
      "label": "Detail level",
      "kind": "text",
      "type": "string",
      "default": "compact",
      "description": "Response detail: compact (default), summary or full. Full includes descriptor and implementation sources.",
    },
    "includeMeta": {
      "label": "Include metadata",
      "kind": "expression",
      "type": "boolean",
      "default": false,
      "description": "Include provider, origin and source sizes in compact responses.",
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
			return ctx.blockGet(props.name, props);
		}
	};
}())
