const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-search-outline",
  "description": "Searches project-local Flow text resources.",
  "properties": {
    "query": {
      "label": "query",
      "kind": "text",
      "type": "string",
      "description": "Text query over project Flow resources."
    },
    "q": {
      "label": "q",
      "kind": "text",
      "type": "string",
      "description": "Short alias for query."
    },
    "limit": {
      "label": "limit",
      "kind": "literal",
      "type": "number",
      "description": "Maximum number of resources to return."
    },
    "cursor": {
      "label": "cursor",
      "kind": "text",
      "type": "string",
      "description": "Pagination cursor returned by a previous search."
    },
    "maxFileBytes": {
      "label": "maxFileBytes",
      "kind": "literal",
      "type": "number",
      "description": "Skip files larger than this size."
    },
    "doc": {
      "label": "doc",
      "kind": "literal",
      "type": "boolean",
      "description": "Include short tool documentation."
    },
    "hints": {
      "label": "hints",
      "kind": "literal",
      "type": "boolean",
      "description": "Include short usage hints."
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
      "description": "Scope path receiving search results."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "search.hooks.js"
  }
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
