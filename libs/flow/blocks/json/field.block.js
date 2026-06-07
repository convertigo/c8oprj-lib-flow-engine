const _meta = {
  "version": 1,
  "icon": "mdi:form-textbox",
  "tags": [
    "json",
    "object",
    "field",
    "key",
    "response"
  ],
  "description": "Adds one field to the nearest parent JSON object.",
  "slots": [
    {
      "name": "nodes",
      "label": "Value",
      "inline": true
    }
  ],
  "properties": {
    "key": {
      "label": "key",
      "kind": "text",
      "type": "string",
      "default": "field",
      "description": "JSON object key."
    },
    "value": {
      "label": "value",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Field value. Use {{ expression }} for dynamic values."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "field.hooks.js"
  },
  "children": [
    "nodes"
  ]
}

(function () {
	function isObject(value) {
		return value && Object.prototype.toString.call(value) === "[object Object]";
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var target = ctx.scopes.local.__jsonTarget;
			if (!isObject(target)) {
				ctx.raise("JSON_TARGET_REQUIRED", "json.field must run inside json.object.");
			}
			var value = node.nodes && node.nodes.length ? ctx.runNodes(node.nodes) : ctx.input(props, null);
			target[String(props.key || "field")] = value;
			return value;
		}
	};
}())
