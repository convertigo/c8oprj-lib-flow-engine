const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:account-key-outline",
  "description": "Writes a value into the current HTTP session.",
  "summary": "session {{key}} = {{value}}",
  "properties": {
    "key": {
      "label": "Session key",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP session attribute name.",
    },
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Value stored in the session. Non-string values are stored as JSON text, which session.get reads back as the stored object, list, number or boolean.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "set.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function sessionString(value) {
		if (value === undefined || value === null) {
			return "";
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	// The attribute keeps its text (JSON for a value that is not a text), as other readers of the session see it. A second
	// attribute marks the text written for an object, a list, a number or a boolean, with its hash: session.get reads that
	// text back as JSON while the mark still matches it, and as the text once anything else wrote the key.
	var JSON_MARK = "__flowSessionJson:";
	function jsonMark(text) {
		var hash = 0;
		for (var i = 0; i < text.length; i++) hash = (31 * hash + text.charCodeAt(i)) | 0;
		return "json:" + text.length + ":" + hash;
	}
	function write(session, key, value) {
		var text = sessionString(value);
		session.setAttribute(key, text);
		if (value !== undefined && value !== null && typeof value !== "string") session.setAttribute(JSON_MARK + key, jsonMark(text));
		else session.removeAttribute(JSON_MARK + key);
		return text;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return write(ctx.convertigoContext().httpSession, String(ctx.template(props.key || "")), ctx.input(props));
		},
		debug: {
			resolve: function (ctx, node) {
				var p = ctx.props(node),
					input = ctx.input(p);
				var context = ctx.convertigoContext();
				var args = { key: String(ctx.template(p.key || "")), value: sessionString(input) };
				Object.defineProperty(args, "context", { value: context });
				Object.defineProperty(args, "input", { value: input });
				return args;
			},
			run: function (ctx, node, args) {
				return write(args.context.httpSession, args.key, args.input);
			}
		}
	};
}())
