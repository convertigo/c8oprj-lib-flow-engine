const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-plus-outline",
  "description": "Creates one project-local block. Rhino HTTP/requestable code is rejected; prefer FlowScript and use Rhino only for one missing Java/algorithm primitive.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Block name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow block name.",
    },
    "implementationSource": {
      "label": "Implementation source",
      "kind": "text",
      "type": "string",
      "description": "Optional low-level implementation source. Prefer canonical block code; Rhino must stay a small primitive.",
    },
    "descriptorSource": {
      "label": "Descriptor source",
      "kind": "text",
      "type": "string",
      "description": "Optional descriptor source converted into canonical block metadata.",
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
    "file": "create.hooks.js",
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
			return ctx.blockCreate(props.name, props, bool(props.overwrite), props);
		}
	};
}())
