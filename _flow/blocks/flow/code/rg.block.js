const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-search-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
    "search",
  ],
  "description": "Searches FlowScript code and returns small matching extracts.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "qname": {
      "label": "Qualified name",
      "kind": "text",
      "type": "string",
      "description": "Optional Flow qname. Omit to search project Flows.",
    },
    "pattern": {
      "label": "Pattern",
      "kind": "text",
      "type": "string",
      "description": "Text or regex pattern.",
    },
    "regex": {
      "label": "Regular expression",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Treat pattern as a regular expression.",
    },
    "caseSensitive": {
      "label": "Case sensitive",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Use case-sensitive matching.",
    },
    "context": {
      "label": "Context lines",
      "kind": "literal",
      "type": "integer",
      "default": 2,
      "description": "Context lines around each match.",
    },
    "limit": {
      "label": "Limit",
      "kind": "literal",
      "type": "integer",
      "default": 20,
      "description": "Maximum number of extracts.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "rg.hooks.js",
  },
}

(function () {
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
			return ctx.flowCodeRg(argsFrom(ctx.props(node)));
		}
	};
}())
