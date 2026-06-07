const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-tree-outline",
  "description": "Lists project-local Flow source resources.",
  "properties": {
    "rootDir": {
      "label": "rootDir",
      "kind": "text",
      "type": "string",
      "default": "libs/flow/resources",
      "description": "Project-local root directory to scan."
    },
    "pattern": {
      "label": "pattern",
      "kind": "text",
      "type": "string",
      "default": "**/*.md",
      "description": "Glob pattern relative to rootDir."
    },
    "limit": {
      "label": "limit",
      "kind": "literal",
      "type": "number",
      "description": "Maximum number of resources to return."
    },
    "skip": {
      "label": "skip",
      "kind": "literal",
      "type": "number",
      "description": "Number of matching resources to skip."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving listed resources."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "list.hooks.js"
  }
}

(function () {
	function argsFrom(ctx, props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = typeof props[key] === "string" ? ctx.template(props[key]) : props[key];
			}
		});
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.resourceList(argsFrom(ctx, ctx.props(node)));
		}
	};
}())
