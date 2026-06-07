const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-search-outline",
  "tags": [
    "block",
    "code",
    "flowscript",
    "search"
  ],
  "description": "Searches project FlowScript block code and returns small matching extracts.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Optional block name. Omit to search visible FlowScript blocks."
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
    "namespace": {
      "label": "namespace",
      "kind": "text",
      "type": "string",
      "description": "Optional block namespace filter."
    },
    "origin": {
      "label": "origin",
      "kind": "text",
      "type": "string",
      "description": "Optional origin filter, for example project."
    },
    "provider": {
      "label": "provider",
      "kind": "text",
      "type": "string",
      "description": "Optional provider filter."
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
			return ctx.blockCodeRg(argsFrom(ctx.props(node)));
		}
	};
}())
