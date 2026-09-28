const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-search-outline",
  "description": "Searches project-local Flow text resources.",
  "properties": {
    "query": {
      "label": "Query",
      "kind": "text",
      "type": "string",
      "description": "Text query over project Flow resources.",
    },
    "q": {
      "label": "Query (alias)",
      "kind": "text",
      "type": "string",
      "description": "Short alias for query.",
    },
    "limit": {
      "label": "Limit",
      "kind": "literal",
      "type": "number",
      "description": "Maximum number of resources to return.",
    },
    "cursor": {
      "label": "Cursor",
      "kind": "text",
      "type": "string",
      "description": "Pagination cursor returned by a previous search.",
    },
    "maxFileBytes": {
      "label": "Maximum file size (bytes)",
      "kind": "literal",
      "type": "number",
      "description": "Skip files larger than this size.",
    },
    "doc": {
      "label": "Include documentation",
      "kind": "literal",
      "type": "boolean",
      "description": "Include short tool documentation.",
    },
    "hints": {
      "label": "Include hints",
      "kind": "literal",
      "type": "boolean",
      "description": "Include short usage hints.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "search.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.resourceSearch(argsFrom(ctx.props(node)));
		}
	};
}())
