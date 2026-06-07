const _meta = {
  "version": 1,
  "icon": "mdi:trash-can-outline",
  "description": "Removes a value from the current HTTP session.",
  "properties": {
    "key": {
      "label": "key",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP session attribute name to remove."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Optional scope path receiving true when the key was removed."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "remove.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var session = ctx.convertigoContext().httpSession;
			var key = String(ctx.template(props.key || ""));
			var existed = session.getAttribute(key) !== null;
			session.removeAttribute(key);
			return existed;
		}
	};
}())
