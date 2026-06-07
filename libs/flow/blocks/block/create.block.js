const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-plus-outline",
  "description": "Creates one project-local block. Rhino HTTP/requestable code is rejected; prefer FlowScript and use Rhino only for one missing Java/algorithm primitive.",
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
      "description": "Optional low-level implementation source. Prefer canonical block code; Rhino must stay a small primitive."
    },
    "descriptorSource": {
      "label": "descriptorSource",
      "kind": "text",
      "type": "string",
      "description": "Optional descriptor source migrated into canonical block metadata."
    },
    "overwrite": {
      "label": "overwrite",
      "kind": "literal",
      "type": "boolean",
      "description": "Allow replacing an existing project-local block."
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
      "description": "Scope path receiving creation result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "create.hooks.js"
  }
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
			return ctx.blockCreate(props.name, props, bool(props.overwrite), props);
		}
	};
}())
