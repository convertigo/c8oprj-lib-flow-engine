const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:content-duplicate",
  "description": "Duplicates one Flow block into a project-local block.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "fromName": {
      "label": "Source name",
      "kind": "text",
      "type": "string",
      "description": "Source block name.",
    },
    "toName": {
      "label": "New name",
      "kind": "text",
      "type": "string",
      "description": "Project-local destination block name.",
    },
    "overwrite": {
      "label": "Overwrite",
      "kind": "literal",
      "type": "boolean",
      "description": "Allow replacing an existing project-local block.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "duplicate.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockDuplicate(props.fromName, props.toName, bool(props.overwrite), props);
		}
	};
}())
