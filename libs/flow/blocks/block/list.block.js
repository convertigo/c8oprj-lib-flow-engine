const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-outline",
  "description": "Lists Flow blocks visible from a project.",
  "properties": {
    "query": {
      "label": "query",
      "kind": "text",
      "type": "string",
      "description": "Optional text filter over block id, namespace, description and property names."
    },
    "q": {
      "label": "q",
      "kind": "text",
      "type": "string",
      "description": "Short alias for query."
    },
    "namespace": {
      "label": "namespace",
      "kind": "text",
      "type": "string",
      "description": "Optional namespace filter, such as json or mcp.tool.flow."
    },
    "provider": {
      "label": "provider",
      "kind": "text",
      "type": "string",
      "description": "Optional provider project filter, such as lib_flow_engine."
    },
    "origin": {
      "label": "origin",
      "kind": "text",
      "type": "string",
      "description": "Optional origin filter: core or project."
    },
    "limit": {
      "label": "limit",
      "kind": "literal",
      "type": "number",
      "description": "Maximum number of blocks to return."
    },
    "cursor": {
      "label": "cursor",
      "kind": "text",
      "type": "string",
      "description": "Pagination cursor returned by a previous catalog call."
    },
    "detail": {
      "label": "detail",
      "kind": "text",
      "type": "string",
      "default": "signature",
      "description": "Palette detail: summary, signature, compact or full. Use signature for discovery."
    },
    "mode": {
      "label": "mode",
      "kind": "text",
      "type": "string",
      "description": "Alias for detail."
    },
    "includePrivate": {
      "label": "includePrivate",
      "kind": "literal",
      "type": "boolean",
      "description": "Include private blocks."
    },
    "includeInternal": {
      "label": "includeInternal",
      "kind": "literal",
      "type": "boolean",
      "description": "Include internal helper blocks hidden from the default palette."
    },
    "includeTypes": {
      "label": "includeTypes",
      "kind": "literal",
      "type": "boolean",
      "description": "Include referenced property type descriptors in compact mode."
    },
    "includeLibraries": {
      "label": "includeLibraries",
      "kind": "literal",
      "type": "boolean",
      "description": "Include visible Flow library descriptors in compact mode."
    },
    "doc": {
      "label": "doc",
      "kind": "literal",
      "type": "boolean",
      "default": true,
      "description": "Include short palette documentation."
    },
    "hints": {
      "label": "hints",
      "kind": "literal",
      "type": "boolean",
      "default": true,
      "description": "Include usage hints. Call with hints=false once understood."
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
      "description": "Scope path receiving the block palette."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "list.hooks.js"
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
		if (!args.detail && !args.mode) {
			args.detail = "signature";
		}
		if (!args.limit) {
			args.limit = 20;
		}
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.blockList(argsFrom(ctx.props(node)));
		}
	};
}())
