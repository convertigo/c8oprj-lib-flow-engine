const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:form-textbox",
  "tags": [
    "json",
    "object",
    "field",
    "key",
    "response",
  ],
  "description": "Adds one field to the nearest parent JSON object.",
  "summary": "{{key}} = {{value}}",
  "slots": [
    {
      "name": "nodes",
      "label": "Value",
      "inline": true,
    },
  ],
  "properties": {
    "key": {
      "label": "Key",
      "kind": "template",
      "type": "string",
      "default": "field",
      "description": "JSON object key: a literal such as \"title\", or a value such as input.attribute for a key known at run time.",
    },
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Field value. Write an expression, a quoted text or a template literal.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "field.hooks.js",
  },
  "children": [
    "nodes",
  ],
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
			var key = props.key === undefined || props.key === null || props.key === "" ? "field" : ctx.template(props.key);
			target[String(key === undefined || key === null || key === "" ? "field" : key)] = value;
			return value;
		}
	};
}())
