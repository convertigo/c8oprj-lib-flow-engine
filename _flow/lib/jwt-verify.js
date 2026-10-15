/*
 * JWT decoding and verification used by the jwt.decode and jwt.verify blocks.
 *
 * Only compact JWS signed with an asymmetric algorithm (RS256/384/512, ES256/384/512) can be
 * verified against a key set: "none" is always refused and HS* only with a shared secret given
 * explicitly (tokens issued by this server with sign(), or by a trusted peer), never from a key
 * set. The signing key otherwise comes from an inline JWKS, a
 * JWKS URL or an OpenID discovery document, picked by kid. Issuer, audience (or the OpenID
 * Connect ID token client id rule), exp / nbf / iat with a clock skew, required claims and the
 * at_hash of an access token are then checked. verify() and decode() never throw: they return
 * { ok: true, header, claims } or { ok: false, error }.
 *
 * Discovery documents and JWKS are fetched over HTTPS (plain http only for a loopback host),
 * without redirects, and cached in the servlet context (JWKS 1 hour, discovery 6 hours). An
 * unknown kid forces a JWKS refresh, at most once a minute per URL.
 *
 * The Java dependent parts are isolated in javaPlatform().
 */
(function () {
	var DEFAULT_CLOCK_SKEW_SECONDS = 300;
	var JWKS_TTL_MS = 3600 * 1000;
	var DISCOVERY_TTL_MS = 6 * 3600 * 1000;
	var MIN_REFRESH_MS = 60 * 1000;
	var MAX_TOKEN_LENGTH = 16384;
	var CACHE_ATTRIBUTE = "lib_flow_engine.jwt.cache";
	var GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

	var ALGORITHMS = {
		RS256: { kty: "RSA", java: "SHA256withRSA" },
		RS384: { kty: "RSA", java: "SHA384withRSA" },
		RS512: { kty: "RSA", java: "SHA512withRSA" },
		ES256: { kty: "EC", crv: "P-256", java: "SHA256withECDSAinP1363Format" },
		ES384: { kty: "EC", crv: "P-384", java: "SHA384withECDSAinP1363Format" },
		ES512: { kty: "EC", crv: "P-521", java: "SHA512withECDSAinP1363Format" }
	};
	var CURVES = { "P-256": "secp256r1", "P-384": "secp384r1", "P-521": "secp521r1" };
	// shared secret algorithms: only for tokens issued by this server or a trusted peer (sign, verify with secret)
	var HMAC_ALGORITHMS = { HS256: "HmacSHA256", HS384: "HmacSHA384", HS512: "HmacSHA512" };

	function VerificationError(message) {
		this.message = message;
	}

	function fail(message) {
		throw new VerificationError(message);
	}

	function isString(value) {
		return typeof value === "string" || value instanceof String ||
			(value != null && typeof value === "object" && value instanceof java.lang.String);
	}

	function nonEmpty(value) {
		return value != null && isString(value) && String(value).length > 0;
	}

	function isArray(value) {
		return Object.prototype.toString.call(value) === "[object Array]";
	}

	function contains(list, value) {
		for (var i = 0; i < list.length; i++) {
			if (list[i] === value) {
				return true;
			}
		}
		return false;
	}

	// A string, a list of strings, or a comma separated string ("a, b") as a list of non empty strings.
	function textList(value) {
		if (value == null || value === "") {
			return [];
		}
		var items = isArray(value) ? value : String(value).split(",");
		var list = [];
		for (var i = 0; i < items.length; i++) {
			if (items[i] != null && String(items[i]).trim().length > 0) {
				list.push(String(items[i]).trim());
			}
		}
		return list;
	}

	/* ---------------------------------------------------------------- Java */

	var localCache = new java.util.concurrent.ConcurrentHashMap();

	function javaPlatform() {
		function cacheMap() {
			try {
				var servletContext = Packages.com.twinsoft.convertigo.engine.Engine.getServletContext();
				if (servletContext == null) {
					return localCache;
				}
				var map = servletContext.getAttribute(CACHE_ATTRIBUTE);
				if (map == null) {
					servletContext.setAttribute(CACHE_ATTRIBUTE, new java.util.concurrent.ConcurrentHashMap());
					map = servletContext.getAttribute(CACHE_ATTRIBUTE);
				}
				return map;
			} catch (e) {
				return localCache;
			}
		}

		function publicKey(jwk) {
			var decoder = java.util.Base64.getUrlDecoder();
			if (jwk.kty === "RSA") {
				var modulus = new java.math.BigInteger(1, decoder.decode(String(jwk.n)));
				if (modulus.bitLength() < 2048) {
					fail("RSA key too short");
				}
				var exponent = new java.math.BigInteger(1, decoder.decode(String(jwk.e)));
				return java.security.KeyFactory.getInstance("RSA").generatePublic(new java.security.spec.RSAPublicKeySpec(modulus, exponent));
			}
			var parameters = java.security.AlgorithmParameters.getInstance("EC");
			parameters.init(new java.security.spec.ECGenParameterSpec(CURVES[jwk.crv]));
			var spec = parameters.getParameterSpec(java.lang.Class.forName("java.security.spec.ECParameterSpec"));
			var point = new java.security.spec.ECPoint(
				new java.math.BigInteger(1, decoder.decode(String(jwk.x))),
				new java.math.BigInteger(1, decoder.decode(String(jwk.y))));
			return java.security.KeyFactory.getInstance("EC").generatePublic(new java.security.spec.ECPublicKeySpec(point, spec));
		}

		return {
			now: function () {
				return Number(java.lang.System.currentTimeMillis());
			},
			decodeBase64Url: function (text) {
				return java.util.Base64.getUrlDecoder().decode(String(text));
			},
			utf8: function (data) {
				return String(new java.lang.String(data, "UTF-8"));
			},
			utf8Bytes: function (text) {
				return new java.lang.String(String(text)).getBytes("UTF-8");
			},
			encodeBase64Url: function (bytes) {
				return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
			},
			hmac: function (alg, secret, signingInput) {
				var mac = javax.crypto.Mac.getInstance(HMAC_ALGORITHMS[alg]);
				mac.init(new javax.crypto.spec.SecretKeySpec(new java.lang.String(String(secret)).getBytes("UTF-8"), HMAC_ALGORITHMS[alg]));
				return mac.doFinal(new java.lang.String(String(signingInput)).getBytes("US-ASCII"));
			},
			constantTimeEquals: function (a, b) {
				return java.security.MessageDigest.isEqual(a, b);
			},
			verifySignature: function (alg, jwk, signingInput, signature) {
				var verifier = java.security.Signature.getInstance(ALGORITHMS[alg].java);
				verifier.initVerify(publicKey(jwk));
				verifier.update(new java.lang.String(signingInput).getBytes("US-ASCII"));
				return verifier.verify(signature) == true;
			},
			// OpenID Connect at_hash: base64url of the left half of the hash of the ASCII access token
			accessTokenHash: function (alg, accessToken) {
				var digest = java.security.MessageDigest.getInstance("SHA-" + alg.substring(2)).digest(new java.lang.String(accessToken).getBytes("US-ASCII"));
				return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(java.util.Arrays.copyOf(digest, digest.length / 2)));
			},
			fetch: function (url) {
				// ProxySelector and Authenticator are installed by the engine ProxyManager.
				var connection = new java.net.URL(url).openConnection();
				connection.setConnectTimeout(5000);
				connection.setReadTimeout(10000);
				connection.setInstanceFollowRedirects(false);
				connection.setUseCaches(false);
				connection.setRequestProperty("Accept", "application/json");
				try {
					var status = connection.getResponseCode();
					if (status != 200) {
						fail("HTTP " + status + " from " + url);
					}
					var input = connection.getInputStream();
					var output = new java.io.ByteArrayOutputStream();
					var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 8192);
					var read;
					while ((read = input.read(buffer)) != -1) {
						output.write(buffer, 0, read);
						if (output.size() > 1048576) {
							fail("response too large from " + url);
						}
					}
					input.close();
					return String(new java.lang.String(output.toByteArray(), "UTF-8"));
				} finally {
					connection.disconnect();
				}
			},
			cacheGet: function (key) {
				var value = cacheMap().get(key);
				return value == null ? null : String(value);
			},
			cachePut: function (key, value) {
				cacheMap().put(key, new java.lang.String(value));
			},
			cacheClear: function () {
				cacheMap().clear();
			}
		};
	}

	var api = { platform: null };

	function platform() {
		if (api.platform == null) {
			api.platform = javaPlatform();
		}
		return api.platform;
	}

	/* --------------------------------------------------------------- parse */

	// https everywhere, plain http only for a loopback host (local identity provider for development).
	function isAllowedUrl(url) {
		var match = /^(https?):\/\/([^\/?#@]+)(?:[\/?][^#]*)?$/i.exec(isString(url) ? String(url) : "");
		if (match == null) {
			return false;
		}
		if (match[1].toLowerCase() === "https") {
			return true;
		}
		var host = match[2].toLowerCase().replace(/:\d+$/, "");
		return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
	}

	function parseJson(text, what) {
		var value;
		try {
			value = JSON.parse(text);
		} catch (e) {
			fail(what + " is not valid JSON");
		}
		if (value == null || typeof value !== "object" || isArray(value)) {
			fail(what + " is not a JSON object");
		}
		return value;
	}

	function decodeSegment(segment, what) {
		var text;
		try {
			text = platform().utf8(platform().decodeBase64Url(segment));
		} catch (e) {
			fail(what + " is not valid base64url");
		}
		return parseJson(text, what);
	}

	function parse(token) {
		if (!nonEmpty(token)) {
			fail("token is missing");
		}
		token = String(token);
		if (token.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
			fail("token is not a signed compact JWT");
		}
		var parts = token.split(".");
		var header = decodeSegment(parts[0], "JWT header");
		var claims = decodeSegment(parts[1], "JWT payload");
		var signature;
		try {
			signature = platform().decodeBase64Url(parts[2]);
		} catch (e) {
			fail("JWT signature is not valid base64url");
		}
		return { header: header, claims: claims, signingInput: parts[0] + "." + parts[1], signature: signature };
	}

	/* ------------------------------------------------------ remote documents */

	function cachedJson(key, url, ttl, force) {
		var now = platform().now();
		var cached = platform().cacheGet(key);
		if (cached != null) {
			var separator = cached.indexOf("|");
			var age = now - Number(cached.substring(0, separator));
			if (age >= 0 && (force ? age < MIN_REFRESH_MS : age < ttl)) {
				return { json: parseJson(cached.substring(separator + 1), url), fresh: false };
			}
		}
		if (!isAllowedUrl(url)) {
			fail("refusing to fetch " + url);
		}
		var text;
		try {
			text = String(platform().fetch(String(url)));
		} catch (e) {
			fail("cannot fetch " + url + ": " + (e && e.message ? e.message : e));
		}
		var json = parseJson(text, url);
		platform().cachePut(key, now + "|" + text);
		return { json: json, fresh: true };
	}

	function discovery(url) {
		var config = cachedJson("discovery:" + url, url, DISCOVERY_TTL_MS, false).json;
		if (!nonEmpty(config.issuer)) {
			fail("discovery document without issuer");
		}
		if (!isAllowedUrl(config.jwks_uri)) {
			fail("discovery document without a usable jwks_uri");
		}
		return config;
	}

	function remoteKeys(uri, force) {
		var result = cachedJson("jwks:" + uri, uri, JWKS_TTL_MS, force);
		if (!isArray(result.json.keys)) {
			fail("JWKS without keys");
		}
		return { keys: result.json.keys, fresh: result.fresh };
	}

	/* ----------------------------------------------------------- signature */

	function candidateKeys(keys, header) {
		var spec = ALGORITHMS[header.alg];
		var selected = [];
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i];
			if (key == null || typeof key !== "object" || key.kty !== spec.kty) {
				continue;
			}
			if (header.kid != null && key.kid !== header.kid) {
				continue;
			}
			if (key.use != null && key.use !== "sig") {
				continue;
			}
			if (key.alg != null && key.alg !== header.alg) {
				continue;
			}
			if (isArray(key.key_ops) && !contains(key.key_ops, "verify")) {
				continue;
			}
			if (spec.kty === "RSA" ? !(nonEmpty(key.n) && nonEmpty(key.e)) : !(key.crv === spec.crv && nonEmpty(key.x) && nonEmpty(key.y))) {
				continue;
			}
			selected.push(key);
		}
		return selected;
	}

	function checkSignature(parsed, source, algorithms) {
		var header = parsed.header;
		if (!nonEmpty(header.alg) || !ALGORITHMS.hasOwnProperty(String(header.alg)) || !contains(algorithms, String(header.alg))) {
			fail("JWT algorithm " + header.alg + " is not accepted");
		}
		if (header.crit != null) {
			fail("JWT critical header parameters are not supported");
		}
		if (header.kid != null && !isString(header.kid)) {
			fail("JWT kid is invalid");
		}
		var keys;
		if (source.keys) {
			keys = candidateKeys(source.keys, header);
		} else {
			var set = remoteKeys(source.uri, false);
			keys = candidateKeys(set.keys, header);
			if (keys.length == 0 && !set.fresh) {
				// unknown kid: the provider may have rotated its keys
				keys = candidateKeys(remoteKeys(source.uri, true).keys, header);
			}
		}
		if (keys.length == 0) {
			fail("no signing key matches the JWT");
		}
		for (var i = 0; i < keys.length; i++) {
			try {
				if (platform().verifySignature(String(header.alg), keys[i], parsed.signingInput, parsed.signature)) {
					return keys[i];
				}
			} catch (e) {
				// unusable key or malformed signature: try the next candidate
			}
		}
		fail("JWT signature is invalid");
	}

	// a token signed with a shared secret (HS256/384/512): the algorithm of the header must be one
	// of the accepted HMAC ones, so a key set never verifies such a token and the reverse
	function checkHmacSignature(parsed, secret, algorithms) {
		var header = parsed.header;
		var alg = nonEmpty(header.alg) ? String(header.alg) : "";
		if (!HMAC_ALGORITHMS.hasOwnProperty(alg) || !contains(algorithms, alg)) {
			fail("JWT algorithm " + header.alg + " is not accepted");
		}
		if (header.crit != null) {
			fail("JWT critical header parameters are not supported");
		}
		if (!platform().constantTimeEquals(platform().hmac(alg, secret, parsed.signingInput), parsed.signature)) {
			fail("JWT signature is invalid");
		}
	}

	/* --------------------------------------------------------------- claims */

	function audiences(claims) {
		var value = claims.aud;
		if (value == null || value === "") {
			return [];
		}
		if (isString(value)) {
			return [String(value)];
		}
		if (!isArray(value)) {
			fail("JWT aud is invalid");
		}
		var list = [];
		for (var i = 0; i < value.length; i++) {
			if (!isString(value[i])) {
				fail("JWT aud is invalid");
			}
			list.push(String(value[i]));
		}
		return list;
	}

	// A {tenantid} issuer template (Microsoft common / organizations authorities) is resolved with the token tid only.
	function resolveIssuer(issuer, claims) {
		if (issuer.indexOf("{tenantid}") == -1) {
			return issuer;
		}
		if (!isString(claims.tid) || !GUID.test(String(claims.tid))) {
			fail("JWT tid is invalid");
		}
		return issuer.replace("{tenantid}", String(claims.tid));
	}

	function checkIssuer(claims, expected, discoveryIssuer) {
		var accepted = [];
		for (var i = 0; i < expected.length; i++) {
			accepted.push(resolveIssuer(expected[i], claims));
		}
		if (discoveryIssuer != null) {
			var resolved = resolveIssuer(discoveryIssuer, claims);
			if (accepted.length == 0) {
				accepted.push(resolved);
			} else if (!contains(accepted, resolved)) {
				fail("discovery issuer does not match the expected issuer");
			}
		}
		if (accepted.length > 0 && !contains(accepted, claims.iss)) {
			fail("JWT issuer is not accepted");
		}
	}

	function checkAudience(claims, clientId, accepted) {
		var list = audiences(claims);
		// ID token (OpenID Connect Core 3.1.3.7): aud contains the client id, azp is the client id when several audiences
		if (clientId) {
			if (!contains(list, clientId)) {
				fail("JWT audience does not contain the client id");
			}
			if (list.length > 1 && claims.azp !== clientId) {
				fail("JWT azp is not the client id");
			}
		}
		if (accepted.length > 0) {
			for (var i = 0; i < list.length; i++) {
				if (contains(accepted, list[i])) {
					return;
				}
			}
			fail("JWT audience is not accepted");
		}
	}

	function checkTime(claims, skew, requireIat) {
		var now = Math.floor(platform().now() / 1000);
		if (typeof claims.exp !== "number" || !isFinite(claims.exp)) {
			fail("JWT exp is missing");
		}
		if (now >= claims.exp + skew) {
			fail("JWT is expired");
		}
		if (claims.nbf != null && (typeof claims.nbf !== "number" || claims.nbf > now + skew)) {
			fail("JWT is not valid yet");
		}
		if (claims.iat == null ? requireIat : (typeof claims.iat !== "number" || claims.iat > now + skew)) {
			fail("JWT iat is missing or in the future");
		}
	}

	function checkRequiredClaims(claims, required) {
		for (var i = 0; i < required.length; i++) {
			var value = claims[required[i]];
			if (value == null || (isString(value) && String(value).length == 0)) {
				fail("JWT " + required[i] + " is missing");
			}
		}
	}

	// Implicit / hybrid flow: at_hash binds the id_token to the access token returned with it.
	function checkAccessTokenHash(parsed, accessToken) {
		if (!nonEmpty(parsed.claims.at_hash) ||
				platform().accessTokenHash(String(parsed.header.alg), String(accessToken)) !== parsed.claims.at_hash) {
			fail("JWT at_hash does not match the access token");
		}
	}

	function guard(run) {
		try {
			return run();
		} catch (e) {
			if (e instanceof VerificationError) {
				return { ok: false, error: e.message };
			}
			return { ok: false, error: "verification failure: " + (e && e.message ? e.message : e) };
		}
	}

	/** Header and claims of a compact JWS, without any verification: never trust them. */
	api.decode = function (token) {
		return guard(function () {
			var parsed = parse(token);
			return { ok: true, header: parsed.header, claims: parsed.claims };
		});
	};

	/**
	 * options: token, and the key source: jwks (inline JWKS object), jwksUri or discovery (OpenID
	 * discovery URL, also giving the expected issuer); issuer (string or list), clientId (ID token
	 * audience rule), audience (string or list), algorithms (default ["RS256"]), accessToken (at_hash),
	 * requiredClaims (list), clockSkewSeconds (default 300).
	 */
	api.verify = function (options) {
		return guard(function () {
			options = options || {};
			var secret = nonEmpty(options.secret) ? String(options.secret) : "";
			var algorithms = textList(options.algorithms);
			if (secret) {
				// with a secret only HMAC algorithms apply: the asymmetric default of the block is dropped
				algorithms = algorithms.filter(function (alg) { return HMAC_ALGORITHMS.hasOwnProperty(alg); });
			}
			if (algorithms.length == 0) {
				algorithms = [secret ? "HS256" : "RS256"];
			}
			var skew = options.clockSkewSeconds == null || options.clockSkewSeconds === "" ? DEFAULT_CLOCK_SKEW_SECONDS : Number(options.clockSkewSeconds);
			if (!isFinite(skew) || skew < 0) {
				fail("clockSkewSeconds is invalid");
			}
			var required = textList(options.requiredClaims);
			var parsed = parse(options.token);
			var source;
			var discoveryIssuer = null;
			if (secret) {
				checkHmacSignature(parsed, secret, algorithms);
			} else {
				if (options.jwks != null && options.jwks !== "") {
					var inline = isString(options.jwks) ? parseJson(String(options.jwks), "jwks") : options.jwks;
					if (!isArray(inline.keys)) {
						fail("jwks without keys");
					}
					source = { keys: inline.keys };
				} else if (nonEmpty(options.jwksUri)) {
					source = { uri: String(options.jwksUri) };
				} else if (nonEmpty(options.discovery)) {
					var config = discovery(String(options.discovery));
					source = { uri: String(config.jwks_uri) };
					discoveryIssuer = String(config.issuer);
				} else {
					fail("jwks, jwksUri, discovery or secret is required");
				}
				checkSignature(parsed, source, algorithms);
			}
			checkIssuer(parsed.claims, textList(options.issuer), discoveryIssuer);
			checkAudience(parsed.claims, nonEmpty(options.clientId) ? String(options.clientId) : "", textList(options.audience));
			checkTime(parsed.claims, skew, contains(required, "iat"));
			checkRequiredClaims(parsed.claims, required);
			if (options.accessToken != null && options.accessToken !== "") {
				checkAccessTokenHash(parsed, options.accessToken);
			}
			return { ok: true, header: parsed.header, claims: parsed.claims };
		});
	};

	/**
	 * Signs claims with a shared secret. options: claims (object), secret, algorithm (HS256 by
	 * default, HS384 or HS512), expiresInSeconds (sets exp from now unless the claims carry one),
	 * header (extra header fields such as kid). iat is set to now unless the claims carry one.
	 * Returns the compact token; throws a VerificationError on an invalid request.
	 */
	api.sign = function (options) {
		options = options || {};
		var alg = nonEmpty(options.algorithm) ? String(options.algorithm) : "HS256";
		if (!HMAC_ALGORITHMS.hasOwnProperty(alg)) {
			fail("JWT algorithm " + alg + " is not supported for signing (HS256, HS384 or HS512)");
		}
		if (!nonEmpty(options.secret)) {
			fail("JWT secret is required");
		}
		var claims = isString(options.claims) ? parseJson(String(options.claims), "claims") : options.claims;
		if (claims == null || typeof claims !== "object" || isArray(claims)) {
			fail("JWT claims must be an object");
		}
		var now = Math.floor(platform().now() / 1000);
		var payload = {};
		for (var key in claims) {
			if (Object.prototype.hasOwnProperty.call(claims, key)) {
				payload[key] = claims[key];
			}
		}
		if (payload.iat == null) {
			payload.iat = now;
		}
		if (options.expiresInSeconds != null && options.expiresInSeconds !== "" && payload.exp == null) {
			var ttl = Number(options.expiresInSeconds);
			if (!isFinite(ttl) || ttl <= 0) {
				fail("expiresInSeconds is invalid");
			}
			payload.exp = now + Math.floor(ttl);
		}
		var header = { alg: alg, typ: "JWT" };
		if (options.header != null && typeof options.header === "object" && !isArray(options.header)) {
			for (var name in options.header) {
				if (Object.prototype.hasOwnProperty.call(options.header, name) && name !== "alg") {
					header[name] = options.header[name];
				}
			}
		}
		var signingInput = platform().encodeBase64Url(platform().utf8Bytes(JSON.stringify(header)))
			+ "." + platform().encodeBase64Url(platform().utf8Bytes(JSON.stringify(payload)));
		return signingInput + "." + platform().encodeBase64Url(platform().hmac(alg, String(options.secret), signingInput));
	};

	api.isAllowedUrl = isAllowedUrl;
	api.clearCache = function () {
		platform().cacheClear();
	};

	return api;
}())
