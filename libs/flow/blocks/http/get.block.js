const _meta = {
  "version": 1,
  "icon": "mdi:web",
  "description": "Calls an HTTP endpoint with GET.",
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "status": {
          "type": "integer"
        },
        "contentType": {
          "type": "string"
        },
        "body": {
          "type": "unknown"
        },
        "text": {
          "type": "string"
        }
      }
    }
  },
  "properties": {
    "url": {
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP URL template to call."
    },
    "headers": {
      "kind": "template",
      "type": "object",
      "description": "Optional HTTP headers object."
    },
    "out": {
      "kind": "path",
      "mode": "write",
      "default": "local.response",
      "description": "Scope path receiving status, contentType, body and text."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js"
  }
}

(function () {
	var IOUtils = Packages.org.apache.commons.io.IOUtils;

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function readUrl(url, headers) {
		var conn = new java.net.URL(String(url)).openConnection();
		if (headers) {
			Object.keys(headers).forEach(function (key) {
				conn.setRequestProperty(String(key), String(headers[key]));
			});
		}
		var text = String(IOUtils.toString(conn.getInputStream(), "UTF-8"));
		var contentType = String(conn.getContentType() || "");
		var body = text;
		var trimmed = text.trim();
		if (contentType.indexOf("json") !== -1 || trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
			body = JSON.parse(text);
		}
		return {
			status: conn.getResponseCode ? conn.getResponseCode() : 200,
			contentType: contentType,
			body: body,
			text: text
		};
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var response = readUrl(ctx.template(props.url), ctx.template(props.headers));
			if (props.out && response.status < 400 && ctx.learnOutputSchema) {
				ctx.learnOutputSchema(node, "out", props.out, response);
			}
			return response;
		}
	};
}())
