const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:key-outline",
  "description": "Reads a value from the current HTTP session: what session.set stored, with its type (a text, or an object, a list, a number or a boolean read back from its JSON text).",
  "summary": "session {{key}}",
  "properties": {
    "key": {
      "label": "Session key",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP session attribute name.",
    },
    "default": {
      "label": "Default value",
      "category": "Expert",
      "kind": "value",
      "type": "unknown",
      "description": "Value returned when the session key is missing.",
    },
  },
  "outputs": {
    "out": {
      "type": "unknown",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	// The mark session.set writes next to the JSON text of a value that is not a text (set.block.js): while it matches the
	// text, the text is read back as JSON; a text stored otherwise (another writer, a former session.set) stays a text.
	var JSON_MARK = "__flowSessionJson:";
	function jsonMark(text) {
		var hash = 0;
		for (var i = 0; i < text.length; i++) hash = (31 * hash + text.charCodeAt(i)) | 0;
		return "json:" + text.length + ":" + hash;
	}
	function read(session, key) {
		var text = String(session.getAttribute(key)), mark = session.getAttribute(JSON_MARK + key);
		if (mark !== null && mark !== undefined && String(mark) === jsonMark(text)) {
			try {
				return JSON.parse(text);
			} catch (notJson) {
				return text;
			}
		}
		return text;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var session = ctx.convertigoContext().httpSession;
			var key = String(ctx.template(props.key || ""));
			var value = session.getAttribute(key);
			if (value === null || value === undefined) {
				return props["default"] === undefined ? null : ctx.input({ value: props["default"] });
			}
			return read(session, key);
		},
		debug: {
			resolve: function (ctx, node) {
				var p = ctx.props(node),
					session = ctx.convertigoContext().httpSession,
					args = { key: String(ctx.template(p.key || "")) };
				Object.defineProperty(args, "session", { value: session });
				return args;
			},
			run: function (ctx, node, args) {
				var value = args.session.getAttribute(args.key);
				if (value === null || value === undefined) {
					var p = ctx.props(node);
					if (p["default"] === undefined) return null;
					args["default"] = ctx.input({ value: p["default"] });
					return args["default"];
				}
				return read(args.session, args.key);
			}
		}
	};
}())
