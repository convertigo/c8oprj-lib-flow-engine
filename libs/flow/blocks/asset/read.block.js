const _meta = {
  "version": 1,
  "icon": "mdi:file-eye-outline",
  "tags": [
    "resource"
  ],
  "description": "Reads a project-local Flow asset as text.",
  "longDescription": "Use assets for templates, snippets, guides or fixtures stored under libs/flow/resources. The block returns the text content so it can be rendered, written or returned by a Flow.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "text",
      "type": "string",
      "default": "libs/flow/resources/asset.txt",
      "description": "Project-local asset path under libs/flow/resources."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.asset",
      "description": "Scope path receiving the asset text."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "read.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var path = String(ctx.template(props.path || "") || "");
			var resource = ctx.resourceGet({
				path: path,
				allowLarge: props.allowLarge !== false
			});
			return resource.content || "";
		}
	};
}())
