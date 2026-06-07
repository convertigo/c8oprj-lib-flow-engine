const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-search-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
    "search"
  ],
  "description": "Searches FlowScript code and returns small matching extracts.",
  "properties": {
    "qname": {
      "label": "qname",
      "kind": "text",
      "type": "string",
      "description": "Optional Flow qname. Omit to search project Flows."
    },
    "pattern": {
      "label": "pattern",
      "kind": "text",
      "type": "string",
      "description": "Text or regex pattern."
    },
    "regex": {
      "label": "regex",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Treat pattern as a regular expression."
    },
    "caseSensitive": {
      "label": "caseSensitive",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Use case-sensitive matching."
    },
    "context": {
      "label": "context",
      "kind": "literal",
      "type": "integer",
      "default": 2,
      "description": "Context lines around each match."
    },
    "limit": {
      "label": "limit",
      "kind": "literal",
      "type": "integer",
      "default": 20,
      "description": "Maximum number of extracts."
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
      "description": "Scope path receiving search extracts."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "rg.hooks.js"
  }
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
