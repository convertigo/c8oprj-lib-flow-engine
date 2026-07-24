const _meta = {
  "version": 1,
  "private": false,
  "icon": "mdi:file-code-outline",
  "tags": ["resource", "project", "file", "read"],
  "description": "Reads a project-local Flow source resource.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow resource path. Takes precedence over uri."
    },
    "uri": {
      "label": "uri",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow resource URI returned by resource.list/search. MCP guide URIs use resources/read."
    },
    "maxBytes": {
      "label": "maxBytes",
      "kind": "literal",
      "type": "number",
      "description": "Maximum content size to return."
    },
    "allowLarge": {
      "label": "allowLarge",
      "kind": "literal",
      "type": "boolean",
      "description": "Allow returning a resource larger than maxBytes."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving the resource content and metadata."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "content": { "type": "string" },
        "truncated": { "type": "boolean" },
        "contentLength": { "type": "integer" },
        "returnedLength": { "type": "integer" },
        "path": { "type": "string" },
        "mimeType": { "type": "string" },
        "hash": { "type": "string" },
        "hint": { "type": "string" }
      }
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
			return ctx.resourceGet(argsFrom(ctx, ctx.props(node)));
		}
	};
}())
