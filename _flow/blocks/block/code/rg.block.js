const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-search-outline",
  "tags": [
    "block",
    "code",
    "flowscript",
    "search",
  ],
  "description": "Searches project FlowScript block code and returns small matching extracts.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Block name",
      "kind": "text",
      "type": "string",
      "description": "Optional block name. Omit to search visible FlowScript blocks.",
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
    "namespace": {
      "label": "Namespace",
      "kind": "text",
      "type": "string",
      "description": "Optional block namespace filter.",
    },
    "origin": {
      "label": "Origin",
      "kind": "text",
      "type": "string",
      "description": "Optional origin filter, for example project.",
    },
    "provider": {
      "label": "Provider",
      "kind": "text",
      "type": "string",
      "description": "Optional provider filter.",
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
			return ctx.blockCodeRg(argsFrom(ctx.props(node)));
		}
	};
}())
