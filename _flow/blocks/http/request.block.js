const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:web",
  "description": "Calls an HTTP endpoint with method, query, headers and optional body.",
  "summary": "{{method}} {{url}}",
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "status": {
          "type": "integer",
        },
        "contentType": {
          "type": "string",
        },
        "headers": {
          "type": "object",
        },
        "body": {
          "type": "unknown",
        },
        "text": {
          "type": "string",
        },
      },
    },
  },
  "properties": {
    "responseType": {"kind":"value","type":"string","enum":["auto","text"],"default":"auto","description":"auto parses JSON bodies; text leaves the original response text in body for a downstream reader."},
    "method": {
      "label": "Method",
      "kind": "text",
      "type": "string",
      "default": "GET",
      "description": "HTTP method to use.",
    },
    "url": {
      "label": "URL",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP URL template to call.",
    },
    "query": {
      "label": "Query parameters",
      "kind": "template",
      "type": "object",
      "description": "Optional query parameters object.",
    },
    "headers": {
      "label": "Headers",
      "category": "Expert",
      "kind": "template",
      "type": "object",
      "description": "Optional HTTP headers object.",
    },
    "body": {
      "label": "Body",
      "kind": "expression",
      "type": "unknown",
      "description": "Optional request body expression. An object is sent as JSON, or as form fields with a Content-Type application/x-www-form-urlencoded header.",
    },
    "username": {
      "label": "User name",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "description": "Optional user name sent with HTTP Basic authentication (preemptive).",
    },
    "password": {
      "label": "Password",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "description": "Password of the HTTP Basic authentication. Read it from config, never write it in the Flow.",
    },
    "connectTimeoutMs": {
      "label": "Connection timeout (ms)",
      "category": "Expert",
      "kind": "expression",
      "type": "integer",
      "default": 60000,
      "description": "Connection timeout in milliseconds.",
    },
    "readTimeoutMs": {
      "label": "Read timeout (ms)",
      "category": "Expert",
      "kind": "expression",
      "type": "integer",
      "default": 60000,
      "description": "Socket read timeout in milliseconds.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "request.hooks.js",
  },
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
	var File = Packages.java.io.File;
	var Files = Packages.java.nio.file.Files;
	var FileUtils = Packages.org.apache.commons.io.FileUtils;
	var JavaHttpClient = Packages.java.net.http.HttpClient;
	var JavaHttpRequest = Packages.java.net.http.HttpRequest;
	var JavaHttpResponse = Packages.java.net.http.HttpResponse;
	var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
	var Base64 = Packages.java.util.Base64;

	var javaHttpClient;

	function putHeader(headers, name, value) {
		var key = String(name || "").toLowerCase();
		if (!key) {
			return;
		}
		var text = String(value === undefined || value === null ? "" : value);
		headers[key] = headers[key] ? headers[key] + ", " + text : text;
	}

	function apacheHeaders(response) {
		var headers = {};
		var values = response && response.getAllHeaders ? response.getAllHeaders() : [];
		for (var i = 0; i < values.length; i++) {
			putHeader(headers, values[i].getName(), values[i].getValue());
		}
		return headers;
	}

	function javaHeaders(response) {
		var headers = {};
		var entries = response.headers().map().entrySet().iterator();
		while (entries.hasNext()) {
			var entry = entries.next();
			var values = entry.getValue().iterator();
			while (values.hasNext()) {
				putHeader(headers, entry.getKey(), values.next());
			}
		}
		return headers;
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

	function hasHeader(headers, headerName) {
		var expected = String(headerName || "").toLowerCase();
		return Object.keys(headers || {}).some(function (key) {
			return String(key).toLowerCase() === expected;
		});
	}

	function headerValue(headers, headerName) {
		var expected = String(headerName || "").toLowerCase();
		var value = "";
		Object.keys(headers || {}).forEach(function (key) {
			if (String(key).toLowerCase() === expected) {
				value = String(headers[key]);
			}
		});
		return value;
	}

	// An object body with a form Content-Type is sent as application/x-www-form-urlencoded fields.
	function formBody(body, headers) {
		if (body === undefined || body === null || typeof body !== "object" ||
				!/application\/x-www-form-urlencoded/i.test(headerValue(headers, "content-type"))) {
			return body;
		}
		var parts = [];
		Object.keys(body).forEach(function (key) {
			var value = body[key];
			if (value === undefined || value === null) {
				return;
			}
			parts.push(URLEncoder.encode(String(key), "UTF-8") + "=" + URLEncoder.encode(String(value), "UTF-8"));
		});
		return parts.join("&");
	}

	function basicAuthorization(username, password) {
		return "Basic " + String(Base64.getEncoder().encodeToString(new java.lang.String(username + ":" + password).getBytes("UTF-8")));
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

	function readResponse(response, allocationTrace, responseType) {
		var entity = response.getEntity();
		var status = response.getStatusLine() ? response.getStatusLine().getStatusCode() : 200;
		var contentTypeHeader = entity && entity.getContentType ? entity.getContentType() : null;
		var contentType = String(contentTypeHeader ? contentTypeHeader.getValue() : "");
		var text = entity ? String(EntityUtils.toString(entity, "UTF-8")) : "";
		var body = text;
		var trimmed = text.trim();
		if (responseType !== "text" && (contentType.indexOf("json") !== -1 || trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[")) {
			var allocation = allocationTrace ? allocationTrace.open("boundary", "http-parse", "") : null;
			try { body = JSON.parse(text); } finally { if (allocation) allocation.close(); }
		}
		return {
			status: status,
			contentType: contentType,
			headers: apacheHeaders(response),
			body: body,
			text: text
		};
	}

	function responseObject(status, contentType, headers, text, allocationTrace, responseType) {
		var body = text;
		var trimmed = text.trim();
		if (responseType !== "text" && (contentType.indexOf("json") !== -1 || trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[")) {
			var allocation = allocationTrace ? allocationTrace.open("boundary", "http-parse", "") : null;
			try { body = JSON.parse(text); } finally { if (allocation) allocation.close(); }
		}
		return {
			status: status,
			contentType: contentType,
			headers: headers || {},
			body: body,
			text: text
		};
	}

	function javaClient(connectTimeoutMs) {
		// Resolve against this call's Packages; cached blocks must not retain a project generation.
		var sharedClients = Packages.com.convertigo.libflowengine.SharedHttpClients;
		if (typeof sharedClients.get === "function") return sharedClients.get(connectTimeoutMs);
		if (!javaHttpClient) {
			javaHttpClient = JavaHttpClient.newBuilder()
				.connectTimeout(Duration.ofMillis(connectTimeoutMs))
				.followRedirects(JavaHttpClient.Redirect.NORMAL)
				.build();
		}
		return javaHttpClient;
	}

	function interrupted(error) {
		var cause = error && error.javaException;
		return !!cause && (cause instanceof Packages.java.lang.InterruptedException
			|| cause instanceof Packages.java.nio.channels.ClosedByInterruptException);
	}

	function isFileUrl(url) {
		return String(url || "").match(/^file:/i) !== null;
	}

	function runFileHttp(method, url, allocationTrace, responseType) {
		method = String(method || "GET").toUpperCase();
		if (method !== "GET" && method !== "HEAD") {
			throw new Error("Unsupported file URL HTTP method: " + method);
		}
		var file = new File(URI.create(String(url)));
		if (!file.isFile()) {
			return responseObject(404, "", {}, "", allocationTrace, responseType);
		}
		var contentType = String(Files.probeContentType(file.toPath()) || "");
		var text = method === "HEAD" ? "" : String(FileUtils.readFileToString(file, "UTF-8"));
		return responseObject(200, contentType, contentType ? { "content-type": contentType } : {}, text, allocationTrace, responseType);
	}

	function runJavaHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs, allocationTrace, responseType) {
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
		return responseObject(response.statusCode(), contentType, javaHeaders(response), String(response.body()), allocationTrace, responseType);
	}

	function runApacheHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs, allocationTrace, responseType) {
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
			return readResponse(httpResponse, allocationTrace, responseType);
		} finally {
			httpResponse.close();
		}
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var responseType=props.responseType===undefined?"auto":String(ctx.template(props.responseType));
			if(responseType!=="auto"&&responseType!=="text")ctx.throwFlow({code:"HTTP_RESPONSE_TYPE_INVALID",message:"responseType takes auto or text.",status:400},node);
			var headers = Object.assign({}, ctx.template(props.headers) || {});
			var username = props.username === undefined || props.username === null ? "" : String(ctx.template(props.username) || "");
			if (username && !hasHeader(headers, "authorization")) {
				var password = props.password === undefined || props.password === null ? "" : String(ctx.template(props.password) || "");
				headers.Authorization = basicAuthorization(username, password);
			}
			var method = String(props.method || "GET").toUpperCase();
			var url = appendQuery(ctx.template(props.url), ctx.template(props.query));
			var connectTimeoutMs = props.connectTimeoutMs === undefined ? 60000 : Number(ctx.expr(props.connectTimeoutMs));
			var readTimeoutMs = props.readTimeoutMs === undefined ? 60000 : Number(ctx.expr(props.readTimeoutMs));
			var body = formBody(props.bodyResolved === true ? props.body : props.body === undefined ? undefined : ctx.expr(props.body), headers);
			var response;
			if (isFileUrl(url)) {
				response = runFileHttp(method, url, ctx.allocationTrace, responseType);
			} else {
				try {
					response = runJavaHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs, ctx.allocationTrace, responseType);
				} catch (e) {
					// an interrupted call (a chunk of a parallel loop stopped after a failed one) is not sent again
					if (interrupted(e)) throw e;
					response = runApacheHttp(method, url, headers, body, connectTimeoutMs, readTimeoutMs, ctx.allocationTrace, responseType);
				}
			}
			if (ctx.outputPath(node) && response.status < 400 && ctx.learnOutputSchema) {
				ctx.learnOutputSchema(node, "out", ctx.outputPath(node), response);
			}
			return response;
		}
	};
}())
