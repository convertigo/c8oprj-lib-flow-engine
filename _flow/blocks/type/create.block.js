const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:shape-plus-outline",
  "description": "Creates one project-local Flow property type.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow property type name.",
    },
    "descriptorSource": {
      "label": "descriptorSource",
      "kind": "text",
      "type": "string",
      "description": "Flow property type descriptor YAML source.",
    },
    "overwrite": {
      "label": "overwrite",
      "kind": "literal",
      "type": "boolean",
      "description": "Allow replacing an existing project-local type.",
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
			return ctx.typeCreate(props.name, {
				descriptorSource: props.descriptorSource || "",
				projectDir: props.projectDir
			}, bool(props.overwrite), props);
		}
	};
}())
