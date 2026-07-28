const _meta = {
  "version": 1,
  "icon": "mdi:file-eye-outline",
  "tags": [
    "resource"
  ],
  "description": "Reads a project-local Flow asset as text.",
  "longDescription": "Use libs/flow/resources for backend-only templates, snippets, guides or fixtures. Use resources for textual assets shared with the generated frontend, so one canonical file can be read by Flow and served to the browser. Flow code passes the project-relative path and receives raw text. MCP flow-resource-get returns an inspection envelope whose content field is the text.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "text",
      "type": "string",
      "default": "libs/flow/resources/asset.txt",
      "description": "Project-local textual asset under libs/flow/resources or resources."
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
