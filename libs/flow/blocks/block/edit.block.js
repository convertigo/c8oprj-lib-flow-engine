const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-edit-outline",
  "description": "Edits one project-local Flow block descriptor and/or implementation. Rhino code should stay a small primitive; HTTP and Convertigo requestable calls belong in visible FlowScript nodes.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow block name."
    },
    "implementationSource": {
      "label": "implementationSource",
      "kind": "text",
      "type": "string",
      "description": "Optional low-level replacement implementation source. Prefer canonical block code; Rhino must stay a small primitive."
    },
    "descriptorSource": {
      "label": "descriptorSource",
      "kind": "text",
      "type": "string",
      "description": "Optional replacement descriptor source migrated into canonical block metadata."
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving edit result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "edit.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockEdit(props.name, props, props);
		}
	};
}())
