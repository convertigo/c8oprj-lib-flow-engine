const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:code-json",
  "tags": [
    "json",
    "object",
    "structure",
    "response",
  ],
  "description": "Builds a JSON object from child fields.",
  "summary": "build object {{out}}",
  "longDescription": "Child json.field nodes write keys into the object. This keeps response structures visible in the Flow tree instead of hiding them in a JSON string.",
  "slots": [
    {
      "name": "fields",
      "label": "Fields",
      "inline": true,
    },
  ],
  "properties": {
  },
  "runtime": "rhino",
  "hooks": {
    "file": "object.hooks.js",
  },
  "children": [
    "fields",
  ],
}

(function () {
	return {
		run: function (ctx, node) {
			var previous = ctx.scopes.local.__jsonTarget;
			var object = {};
			ctx.scopes.local.__jsonTarget = object;
			try {
				ctx.runNodes(node.fields || []);
			} finally {
				ctx.scopes.local.__jsonTarget = previous;
			}
			return object;
		}
	};
}())
