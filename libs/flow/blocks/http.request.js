(function () {
	var IOUtils = Packages.org.apache.commons.io.IOUtils;
	var OutputStreamWriter = Packages.java.io.OutputStreamWriter;
	var URLEncoder = Packages.java.net.URLEncoder;

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function appendQuery(url, query) {
		if (!query) {
			return String(url);
		}
		var parts = [];
		Object.keys(query).forEach(function (key) {
			var value = query[key];
			if (value === undefined || value === null) {
				return;
			}
			parts.push(URLEncoder.encode(String(key), "UTF-8") + "=" + URLEncoder.encode(String(value), "UTF-8"));
		});
		if (parts.length === 0) {
			return String(url);
		}
		return String(url) + (String(url).indexOf("?") === -1 ? "?" : "&") + parts.join("&");
	}

	function writeBody(conn, body, headers) {
		if (body === undefined || body === null) {
			return;
		}
		var text = typeof body === "string" ? body : JSON.stringify(body);
		var hasContentType = false;
		Object.keys(headers || {}).forEach(function (key) {
			if (String(key).toLowerCase() === "content-type") {
				hasContentType = true;
			}
		});
		if (!hasContentType && typeof body !== "string") {
			conn.setRequestProperty("Content-Type", "application/json");
		}
		conn.setDoOutput(true);
		var writer = new OutputStreamWriter(conn.getOutputStream(), "UTF-8");
		try {
			writer.write(text);
		} finally {
			writer.close();
		}
	}

	function readResponse(conn) {
		var status = conn.getResponseCode ? conn.getResponseCode() : 200;
		var stream = status >= 400 && conn.getErrorStream ? conn.getErrorStream() : conn.getInputStream();
		var text = stream ? String(IOUtils.toString(stream, "UTF-8")) : "";
		var contentType = String(conn.getContentType() || "");
		var body = text;
		var trimmed = text.trim();
		if (contentType.indexOf("json") !== -1 || trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
			body = JSON.parse(text);
		}
		return {
			status: status,
			contentType: contentType,
			body: body,
			text: text
		};
	}

	return {
		name: "http.request",

		catalog: function () {
			return {
				name: "http.request",
				icon: "mdi:web",
				props: {
					method: { kind: "text", type: "string", "default": "GET", description: "HTTP method to use." },
					url: { kind: "template", type: "string", "default": "", description: "HTTP URL template to call." },
					query: { kind: "template", type: "object", description: "Optional query parameters object." },
					headers: { kind: "template", type: "object", description: "Optional HTTP headers object." },
					body: { kind: "expression", type: "unknown", description: "Optional request body expression." },
					out: { kind: "path", mode: "write", "default": "flow.response", description: "Scope path receiving status, contentType, body and text." }
				},
				description: "Calls an HTTP endpoint with method, query, headers and optional body."
			};
		},

		displayName: function (node) {
			var method = prop(node, "method") || "GET";
			return flowSummary.output(node, String(method).toUpperCase() + " " + flowSummary.text(prop(node, "url") || "url"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var headers = ctx.template(props.headers) || {};
			var conn = new java.net.URL(appendQuery(ctx.template(props.url), ctx.template(props.query))).openConnection();
			var method = String(props.method || "GET").toUpperCase();
			if (conn.setRequestMethod) {
				conn.setRequestMethod(method);
			}
			Object.keys(headers).forEach(function (key) {
				conn.setRequestProperty(String(key), String(headers[key]));
			});
			writeBody(conn, props.body === undefined ? undefined : ctx.expr(props.body), headers);
			return readResponse(conn);
		}
	};
}())
