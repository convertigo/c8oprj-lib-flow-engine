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
      "description": "Connection timeout in milliseconds, also the longest wait for a free connection of the pool.",
    },
    "readTimeoutMs": {
      "label": "Read timeout (ms)",
      "category": "Expert",
      "kind": "expression",
      "type": "integer",
      "default": 60000,
      "description": "Socket read timeout in milliseconds: the longest wait for data from the server.",
    },
    "cookies": {
      "label": "Cookies",
      "category": "Expert",
      "kind": "value",
      "type": "string",
      "enum": ["context", "request"],
      "default": "context",
      "description": "context sends and keeps the cookies of the Convertigo context, as the HTTP connectors do (shared with them, kept between calls of a named context); request keeps the cookies received only for the redirections of this call.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "request.hooks.js",
  },
}

(function () {
	// One client, the one of the Convertigo engine (its pool and proxy settings), and no second one: a request is sent
	// once. Each request carries an entity, empty without a body, so that the retry handler of the client only sends it
	// again when it failed before being sent. Its cookies are never those of the store the client shares between all the
	// calls of the server: each call has its cookie context, on the HttpState of its Convertigo context as with the HTTP
	// connectors, and follows the redirections itself to read and write them at each step.
	//
	// The classes of the JDK and of the engine (the client of the engine is httpclient 4 of the engine, never a copy of
	// the libraries of a project): from the engine that evaluates the module (flowEngineClass, kept for the runtime),
	// else by their full names. Through the Packages of a call, each name looked up the names of its packages as
	// classes, and each class of the engine was searched first in the libraries of the project.
	function javaClass(name) {
		return typeof flowEngineClass === "function" ? flowEngineClass(name) : Packages[name];
	}
	var Engine = javaClass("com.twinsoft.convertigo.engine.Engine");
	var HttpUtils = javaClass("com.twinsoft.convertigo.engine.util.HttpUtils");
	var EntityUtils = javaClass("org.apache.http.util.EntityUtils");
	var RequestBuilder = javaClass("org.apache.http.client.methods.RequestBuilder");
	var RequestConfig = javaClass("org.apache.http.client.config.RequestConfig");
	var CookieSpecs = javaClass("org.apache.http.client.config.CookieSpecs");
	var HttpClientContext = javaClass("org.apache.http.client.protocol.HttpClientContext");
	var RequestAddCookies = javaClass("org.apache.http.client.protocol.RequestAddCookies");
	var ResponseProcessCookies = javaClass("org.apache.http.client.protocol.ResponseProcessCookies");
	var CookieSpecRegistries = javaClass("org.apache.http.impl.client.CookieSpecRegistries");
	var CookieStore = javaClass("org.apache.http.client.CookieStore");
	var BasicCookieStore = javaClass("org.apache.http.impl.client.BasicCookieStore");
	var BasicClientCookie = javaClass("org.apache.http.impl.cookie.BasicClientCookie");
	var ClientCookie = javaClass("org.apache.http.cookie.ClientCookie");
	var HttpHost = javaClass("org.apache.http.HttpHost");
	var HttpRoute = javaClass("org.apache.http.conn.routing.HttpRoute");
	var URIUtils = javaClass("org.apache.http.client.utils.URIUtils");
	var ByteArrayEntity = javaClass("org.apache.http.entity.ByteArrayEntity");
	var LegacyCookie = javaClass("org.apache.commons.httpclient.Cookie");
	var ArrayList = javaClass("java.util.ArrayList");
	var JavaThread = javaClass("java.lang.Thread");
	var JavaString = javaClass("java.lang.String");
	var JavaArray = javaClass("java.lang.reflect.Array");
	var JavaByte = javaClass("java.lang.Byte");
	var URLEncoder = javaClass("java.net.URLEncoder");
	var URI = javaClass("java.net.URI");
	var File = javaClass("java.io.File");
	var Files = javaClass("java.nio.file.Files");
	var FileUtils = javaClass("org.apache.commons.io.FileUtils");
	var StandardCharsets = javaClass("java.nio.charset.StandardCharsets");
	var Base64 = javaClass("java.util.Base64");

	// as the JDK client used until 0.1.114: at most 5 responses, the fifth returned as is when it redirects again
	var MAX_RESPONSES = 5;
	var REDIRECTS = { 301: true, 302: true, 303: true, 307: true, 308: true };
	// headers a redirection to another origin drops, as the JDK client did
	var ORIGIN_HEADERS = { "authorization": true, "cookie": true, "origin": true, "referer": true, "host": true };
	// headers the client computes from the entity
	var ENTITY_HEADERS = { "content-length": true, "transfer-encoding": true };
	var NO_BODY = JavaArray.newInstance(JavaByte.TYPE, 0);
	var requestCookies = new RequestAddCookies();
	var responseCookies = new ResponseProcessCookies();
	var cookieSpecs = null;

	function putHeader(headers, name, value) {
		var key = String(name || "").toLowerCase();
		if (!key) {
			return;
		}
		var text = String(value === undefined || value === null ? "" : value);
		headers[key] = headers[key] ? headers[key] + ", " + text : text;
	}

	function responseHeaders(response) {
		var headers = {};
		var values = response.getAllHeaders();
		for (var i = 0; i < values.length; i++) {
			putHeader(headers, values[i].getName(), values[i].getValue());
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
		return "Basic " + String(Base64.getEncoder().encodeToString(new JavaString(username + ":" + password).getBytes("UTF-8")));
	}

	// The bytes of the body, UTF-8: an object is sent as JSON, with its Content-Type when the headers have none
	function bodyBytes(body, headers) {
		if (body === undefined || body === null) {
			return NO_BODY;
		}
		if (!hasHeader(headers, "content-type") && typeof body !== "string") {
			headers["Content-Type"] = "application/json";
		}
		return new JavaString(typeof body === "string" ? body : JSON.stringify(body)).getBytes(StandardCharsets.UTF_8);
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

	// the text in the charset of the response, UTF-8 when it has none
	function readResponse(response, allocationTrace, responseType) {
		var entity = response.getEntity();
		var contentType = response.getFirstHeader("Content-Type");
		var text = entity ? String(EntityUtils.toString(entity, "UTF-8")) : "";
		return responseObject(Number(response.getStatusLine().getStatusCode()), String(contentType ? contentType.getValue() : ""),
			responseHeaders(response), text, allocationTrace, responseType);
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

	// The cookies of the HttpState (commons-httpclient 3, the HTTP connectors) seen as httpclient 4 cookies. A domain
	// cookie keeps a leading dot in the HttpState: the Redis store of the contexts keeps its domain, not its flags.
	function clientCookie(legacy) {
		var domain = String(legacy.getDomain() || "");
		var cookie = new BasicClientCookie(legacy.getName(), legacy.getValue());
		cookie.setDomain(domain.charAt(0) === "." ? domain.substring(1) : domain);
		cookie.setPath(legacy.getPath());
		cookie.setExpiryDate(legacy.getExpiryDate());
		cookie.setSecure(legacy.getSecure());
		cookie.setVersion(legacy.getVersion());
		cookie.setComment(legacy.getComment());
		if (legacy.isDomainAttributeSpecified() || domain.charAt(0) === ".") {
			cookie.setAttribute(ClientCookie.DOMAIN_ATTR, domain);
		}
		if (legacy.isPathAttributeSpecified() && legacy.getPath() !== null) {
			cookie.setAttribute(ClientCookie.PATH_ATTR, legacy.getPath());
		}
		return cookie;
	}

	function legacyCookie(cookie) {
		var name = cookie.getName();
		var domain = cookie.getDomain();
		if (name === null || domain === null || !String(name).trim()) {
			return null;
		}
		domain = String(domain);
		var domainAttribute = cookie instanceof ClientCookie && cookie.containsAttribute(ClientCookie.DOMAIN_ATTR);
		var legacy = new LegacyCookie(domainAttribute && domain.charAt(0) !== "." ? "." + domain : domain, name, cookie.getValue(),
			cookie.getPath(), cookie.getExpiryDate(), cookie.isSecure());
		legacy.setDomainAttributeSpecified(domainAttribute);
		legacy.setPathAttributeSpecified(cookie instanceof ClientCookie && cookie.containsAttribute(ClientCookie.PATH_ATTR));
		legacy.setVersion(cookie.getVersion());
		legacy.setComment(cookie.getComment());
		return legacy;
	}

	// Stateless over the HttpState, whose methods are synchronized: the parallel chunks of a call share it safely.
	// JavaAdapter, not new CookieStore({...}): in the shared runtime of the server, the scope of a call owns the Java
	// packages of its project but not JavaAdapter, where Rhino looks for it to implement an interface given to new.
	function httpStateCookies(state) {
		return new JavaAdapter(CookieStore, {
			addCookie: function (cookie) {
				var legacy = legacyCookie(cookie);
				if (legacy) {
					state.addCookie(legacy);
				}
			},
			getCookies: function () {
				var legacy = state.getCookies();
				var cookies = new ArrayList(legacy.length);
				for (var i = 0; i < legacy.length; i++) {
					cookies.add(clientCookie(legacy[i]));
				}
				return cookies;
			},
			clearExpired: function (date) {
				return state.purgeExpiredCookies(date);
			},
			clear: function () {
				state.clearCookies();
			}
		});
	}

	// The cookie context of a call: the HttpState of its Convertigo context, or cookies of this call only (a run
	// without Convertigo context, a Flow called directly by another one, or cookies "request")
	function cookieContext(ctx, mode) {
		var state = mode === "context" && typeof ctx.convertigoHttpState === "function" ? ctx.convertigoHttpState() : null;
		var context = HttpClientContext.create();
		context.setCookieStore(state ? httpStateCookies(state) : new BasicCookieStore());
		context.setCookieSpecRegistry(cookieSpecs || (cookieSpecs = CookieSpecRegistries.createDefault()));
		// RFC 6265, as browsers: Max-Age is read, a deleted cookie is removed
		context.setRequestConfig(RequestConfig.custom().setCookieSpec(CookieSpecs.STANDARD).build());
		return context;
	}

	// what the client does with its own cookie store before an exchange, here with the cookie context of the call
	function addCookies(cookies, request, uri) {
		var target = URIUtils.extractHost(uri);
		if (target === null) {
			return;
		}
		var secure = String(target.getSchemeName()).toLowerCase() === "https";
		var port = target.getPort() > 0 ? target.getPort() : secure ? 443 : 80;
		cookies.setAttribute(HttpClientContext.HTTP_TARGET_HOST, target);
		cookies.setAttribute(HttpClientContext.HTTP_ROUTE, new HttpRoute(new HttpHost(target.getHostName(), port, target.getSchemeName()), null, secure));
		requestCookies.process(request, cookies);
	}

	function requestConfig(connectTimeoutMs, readTimeoutMs) {
		return RequestConfig.custom()
			.setConnectTimeout(connectTimeoutMs)
			// a saturated pool fails instead of waiting for ever
			.setConnectionRequestTimeout(connectTimeoutMs)
			.setSocketTimeout(readTimeoutMs)
			// redirections and cookies are handled by the call; the cookie store of the client is never read nor written
			.setRedirectsEnabled(false)
			.setCookieSpec(CookieSpecs.IGNORE_COOKIES)
			// the path is sent as written
			.setNormalizeUri(false)
			.build();
	}

	function buildRequest(method, uri, headers, bytes, config) {
		var builder = RequestBuilder.create(method).setUri(uri).setConfig(config);
		Object.keys(headers).forEach(function (key) {
			if (!ENTITY_HEADERS[String(key).toLowerCase()]) {
				builder.addHeader(String(key), String(headers[key]));
			}
		});
		builder.setEntity(new ByteArrayEntity(bytes));
		return builder.build();
	}

	// The next URI of a redirection followed as the JDK client did (NORMAL policy): 301, 302, 303, 307 and 308 with a
	// valid Location, to the same scheme or to https, never from https to http. Null returns the response as is.
	function redirection(status, response, uri) {
		if (!REDIRECTS[status]) {
			return null;
		}
		var location = response.getFirstHeader("Location");
		if (location === null) {
			return null;
		}
		var next;
		try {
			next = uri.resolve(URI.create(String(location.getValue())));
		} catch (invalid) {
			return null;
		}
		var scheme = String(next.getScheme() || "").toLowerCase();
		return scheme === String(uri.getScheme()).toLowerCase() || scheme === "https" ? next : null;
	}

	function sameOrigin(uri, next) {
		return String(uri.getScheme()).toLowerCase() === String(next.getScheme()).toLowerCase()
			&& String(uri.getRawAuthority()) === String(next.getRawAuthority());
	}

	// Engine.theApp.httpClient4 when the engine runs (read at each call: the engine replaces it when its proxy settings
	// change); otherwise a client of this call alone, with the same settings
	function engineClient(ctx, node) {
		if (typeof HttpUtils !== "function") {
			ctx.throwFlow({code: "HTTP_CLIENT_UNAVAILABLE", message: "http.request needs the HTTP client of the Convertigo engine.", status: 500}, node);
		}
		var app = Engine.theApp;
		var shared = app ? app.httpClient4 : null;
		return shared ? { client: shared, owned: false } : { client: HttpUtils.makeHttpClient(false), owned: true };
	}

	function send(ctx, node, method, uri, headers, body, cookieMode, config, responseType) {
		var cookies = cookieContext(ctx, cookieMode);
		var bytes = bodyBytes(body, headers);
		var engine = engineClient(ctx, node);
		try {
			for (var responses = 1; ; responses++) {
				// a parallel chunk stopped after a failed one sends nothing more
				if (JavaThread.currentThread().isInterrupted()) {
					ctx.throwFlow({code: "FLOW_EXECUTION_CANCELLED", message: "The HTTP call was not sent: its thread was interrupted.", status: 499}, node);
				}
				var request = buildRequest(method, uri, headers, bytes, config);
				addCookies(cookies, request, uri);
				var response = engine.client.execute(request);
				var status, next;
				try {
					responseCookies.process(response, cookies);
					status = Number(response.getStatusLine().getStatusCode());
					next = responses < MAX_RESPONSES ? redirection(status, response, uri) : null;
					if (next === null) {
						return readResponse(response, ctx.allocationTrace, responseType);
					}
					EntityUtils.consumeQuietly(response.getEntity());
				} finally {
					response.close();
				}
				// as the JDK client: 303 and a POST redirected by 301 or 302 become a GET without body
				var nextMethod = status === 303 || (status === 301 || status === 302) && method === "POST" ? "GET" : method;
				if (status === 303 || nextMethod !== method) {
					bytes = NO_BODY;
				}
				if (!sameOrigin(uri, next)) {
					headers = Object.keys(headers).reduce(function (kept, key) {
						if (!ORIGIN_HEADERS[String(key).toLowerCase()]) {
							kept[key] = headers[key];
						}
						return kept;
					}, {});
				}
				method = nextMethod;
				uri = next;
			}
		} finally {
			if (engine.owned && typeof engine.client.close === "function") {
				try { engine.client.close(); } catch (closing) { /* the client of this call only */ }
			}
		}
	}

	function timeout(ctx, node, value, name) {
		var ms = value === undefined ? 60000 : Number(ctx.expr(value));
		if (!(ms > 0)) {
			ctx.throwFlow({code: "HTTP_TIMEOUT_INVALID", message: name + " takes a positive number of milliseconds.", status: 400}, node);
		}
		return Math.min(Math.ceil(ms), 2147483647);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var responseType=props.responseType===undefined?"auto":String(ctx.template(props.responseType));
			if(responseType!=="auto"&&responseType!=="text")ctx.throwFlow({code:"HTTP_RESPONSE_TYPE_INVALID",message:"responseType takes auto or text.",status:400},node);
			var cookies = props.cookies === undefined ? "context" : String(ctx.template(props.cookies));
			if (cookies !== "context" && cookies !== "request") {
				ctx.throwFlow({code: "HTTP_COOKIES_INVALID", message: "cookies takes context or request.", status: 400}, node);
			}
			var headers = Object.assign({}, ctx.template(props.headers) || {});
			var username = props.username === undefined || props.username === null ? "" : String(ctx.template(props.username) || "");
			if (username && !hasHeader(headers, "authorization")) {
				var password = props.password === undefined || props.password === null ? "" : String(ctx.template(props.password) || "");
				headers.Authorization = basicAuthorization(username, password);
			}
			var method = String(props.method || "GET").toUpperCase();
			var url = appendQuery(ctx.template(props.url), ctx.template(props.query));
			var connectTimeoutMs = timeout(ctx, node, props.connectTimeoutMs, "connectTimeoutMs");
			var readTimeoutMs = timeout(ctx, node, props.readTimeoutMs, "readTimeoutMs");
			var body = formBody(props.bodyResolved === true ? props.body : props.body === undefined ? undefined : ctx.expr(props.body), headers);
			var response = isFileUrl(url)
				? runFileHttp(method, url, ctx.allocationTrace, responseType)
				: send(ctx, node, method, URI.create(url), headers, body, cookies, requestConfig(connectTimeoutMs, readTimeoutMs), responseType);
			if (ctx.outputPath(node) && response.status < 400 && ctx.learnOutputSchema) {
				ctx.learnOutputSchema(node, "out", ctx.outputPath(node), response);
			}
			return response;
		}
	};
}())
