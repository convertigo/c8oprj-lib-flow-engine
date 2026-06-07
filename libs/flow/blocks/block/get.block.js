const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-outline",
  "description": "Reads one Flow block as a logical descriptor plus implementation unit.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Flow block name."
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "detail": {
      "label": "detail",
      "kind": "text",
      "type": "string",
      "default": "compact",
      "description": "Response detail: compact (default), summary or full. Full includes descriptor and implementation sources."
    },
    "includeMeta": {
      "label": "includeMeta",
      "kind": "expression",
      "type": "boolean",
      "default": false,
      "description": "Include provider, origin and source sizes in compact responses."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving descriptor and implementation sources."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js"
  }
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
