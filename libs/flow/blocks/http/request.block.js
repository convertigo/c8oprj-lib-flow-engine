const _meta = {
  "version": 1,
  "icon": "mdi:web",
  "description": "Calls an HTTP endpoint with method, query, headers and optional body.",
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
    "method": {
      "kind": "text",
      "type": "string",
      "default": "GET",
      "description": "HTTP method to use."
    },
    "url": {
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP URL template to call."
    },
    "query": {
      "kind": "template",
      "type": "object",
      "description": "Optional query parameters object."
    },
    "headers": {
      "kind": "template",
      "type": "object",
      "description": "Optional HTTP headers object."
    },
    "body": {
      "kind": "expression",
      "type": "unknown",
      "description": "Optional request body expression."
    },
    "connectTimeoutMs": {
      "kind": "expression",
      "type": "integer",
      "default": 60000,
      "description": "Connection timeout in milliseconds."
    },
    "readTimeoutMs": {
      "kind": "expression",
      "type": "integer",
      "default": 60000,
      "description": "Socket read timeout in milliseconds."
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
    "file": "request.hooks.js"
  }
}

(function () {
	var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
	var EntityUtils = Packages.org.apache.http.util.EntityUtils;
	var HttpUtils = Packages.com.twinsoft.convertigo.engine.util.HttpUtils;
	var RequestBuilder = Packages.org.apache.http.client.methods.RequestBuilder;
	var RequestConfig = Packages.org.apache.http.client.config.RequestConfig;
	var StringEntity = Packages.org.apache.http.entity.StringEntity;
	var URLEncoder = Packages.java.net.URLEncoder;
	var URI = Packages.java.net.URI;
	var Duration = Packages.java.time.Duration;
	var JavaHttpClient = Packages.java.net.http.HttpClient;
	var JavaHttpRequest = Packages.java.net.http.HttpRequest;
	var JavaHttpResponse = Packages.java.net.http.HttpResponse;
	var StandardCharsets = Packages.java.nio.charset.StandardCharsets;

	var javaHttpClient;

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

	function hasHeader(headers, headerName) {
		var expected = String(headerName || "").toLowerCase();
		return Object.keys(headers || {}).some(function (key) {
			return String(key).toLowerCase() === expected;
		});
	}

	function addHeaders(builder, headers) {
		Object.keys(headers || {}).forEach(function (key) {
			builder.addHeader(String(key), String(headers[key]));
		});
	}

	function addBody(builder, body, headers) {
		if (body === undefined || body === null) {
			return;
		}
		var text = typeof body === "string" ? body : JSON.stringify(body);
		if (!hasHeader(headers, "content-type") && typeof body !== "string") {
			builder.addHeader("Content-Type", "application/json");
		}
		builder.setEntity(new StringEntity(text, "UTF-8"));
	}

	function readResponse(response) {
		var entity = response.getEntity();
		var status = response.getStatusLine() ? response.getStatusLine().getStatusCode() : 200;
		var contentTypeHeader = entity && entity.getContentType ? entity.getContentType() : null;
		var contentType = String(contentTypeHeader ? contentTypeHeader.getValue() : "");
		var text = entity ? String(EntityUtils.toString(entity, "UTF-8")) : "";
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

	function responseObject(status, contentType, text) {
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

	function javaClient(connectTimeoutMs) {
		if (!javaHttpClient) {
			javaHttpClient = JavaHttpClient.newBuilder()
				.connectTimeout(Duration.ofMillis(connectTimeoutMs))
				.followRedirects(JavaHttpClient.Redirect.NORMAL)
				.build();
		}
		return javaHttpClient;
	}

	function runJavaHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs) {
		var builder = JavaHttpRequest.newBuilder(URI.create(String(url)))
			.timeout(Duration.ofMillis(readTimeoutMs));
		Object.keys(headers || {}).forEach(function (key) {
			builder.header(String(key), String(headers[key]));
		});
		if (body === undefined || body === null) {
			builder.method(method, JavaHttpRequest.BodyPublishers.noBody());
		} else {
			var text = typeof body === "string" ? body : JSON.stringify(body);
			if (!hasHeader(headers, "content-type") && typeof body !== "string") {
				builder.header("Content-Type", "application/json");
			}
			builder.method(method, JavaHttpRequest.BodyPublishers.ofString(text, StandardCharsets.UTF_8));
		}
		var response = javaClient(connectTimeoutMs).send(builder.build(), JavaHttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
		var contentType = String(response.headers().firstValue("content-type").orElse(""));
		return responseObject(response.statusCode(), contentType, String(response.body()));
	}

	function runApacheHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs) {
		var builder = RequestBuilder.create(method).setUri(url);
		builder.setConfig(RequestConfig.custom()
			.setRedirectsEnabled(true)
			.setConnectTimeout(connectTimeoutMs)
			.setSocketTimeout(readTimeoutMs)
			.build());
		addHeaders(builder, headers);
		addBody(builder, body, headers);
		var client = Engine.theApp && Engine.theApp.httpClient4 ? Engine.theApp.httpClient4 : HttpUtils.makeHttpClient(false);
		var httpResponse = client.execute(builder.build());
		try {
			return readResponse(httpResponse);
		} finally {
			httpResponse.close();
		}
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var headers = ctx.template(props.headers) || {};
			var method = String(props.method || "GET").toUpperCase();
			var url = appendQuery(ctx.template(props.url), ctx.template(props.query));
			var connectTimeoutMs = props.connectTimeoutMs === undefined ? 60000 : Number(ctx.expr(props.connectTimeoutMs));
			var readTimeoutMs = props.readTimeoutMs === undefined ? 60000 : Number(ctx.expr(props.readTimeoutMs));
			var body = props.bodyResolved === true ? props.body : props.body === undefined ? undefined : ctx.expr(props.body);
			var response;
			try {
				response = runJavaHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs);
			} catch (e) {
				response = runApacheHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs);
			}
			if (props.out && response.status < 400 && ctx.learnOutputSchema) {
				ctx.learnOutputSchema(node, "out", props.out, response);
			}
			return response;
		}
	};
}())
