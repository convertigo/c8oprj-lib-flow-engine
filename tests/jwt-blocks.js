// jwt.decode and jwt.verify with tokens signed by the JVM: inline JWKS, a local discovery
// document and JWKS (127.0.0.1), key rotation, and every refusal rule.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-jwt-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var Base64 = java.util.Base64;
function b64(bytes) {
	return String(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
}
function b64json(value) {
	return b64(new java.lang.String(JSON.stringify(value)).getBytes("UTF-8"));
}
function unsigned(bigInteger) {
	var bytes = bigInteger.toByteArray();
	return bytes[0] == 0 && bytes.length > 1 ? java.util.Arrays.copyOfRange(bytes, 1, bytes.length) : bytes;
}
function fixed(bigInteger, size) {
	var bytes = unsigned(bigInteger);
	var out = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, size);
	java.lang.System.arraycopy(bytes, 0, out, size - bytes.length, bytes.length);
	return out;
}

function rsaKey(kid, bits) {
	var generator = java.security.KeyPairGenerator.getInstance("RSA");
	generator.initialize(bits);
	var pair = generator.generateKeyPair();
	var pub = pair.getPublic();
	return { kid: kid, alg: "RS256", java: "SHA256withRSA", privateKey: pair.getPrivate(),
		jwk: { kty: "RSA", kid: kid, use: "sig", n: b64(unsigned(pub.getModulus())), e: b64(unsigned(pub.getPublicExponent())) } };
}

function ecKey(kid) {
	var generator = java.security.KeyPairGenerator.getInstance("EC");
	generator.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));
	var pair = generator.generateKeyPair();
	var point = pair.getPublic().getW();
	return { kid: kid, alg: "ES256", java: "SHA256withECDSAinP1363Format", privateKey: pair.getPrivate(),
		jwk: { kty: "EC", kid: kid, use: "sig", crv: "P-256", x: b64(fixed(point.getAffineX(), 32)), y: b64(fixed(point.getAffineY(), 32)) } };
}

function sign(key, claims, header) {
	var input = b64json(header || { alg: key.alg, kid: key.kid, typ: "JWT" }) + "." + b64json(claims);
	var signer = java.security.Signature.getInstance(key.java);
	signer.initSign(key.privateKey);
	signer.update(new java.lang.String(input).getBytes("US-ASCII"));
	return input + "." + b64(signer.sign());
}

function atHash(accessToken) {
	var digest = java.security.MessageDigest.getInstance("SHA-256").digest(new java.lang.String(accessToken).getBytes("US-ASCII"));
	return b64(java.util.Arrays.copyOf(digest, 16));
}

var now = Math.floor(Number(java.lang.System.currentTimeMillis()) / 1000);
var rsa = rsaKey("r1", 2048);
var rotated = rsaKey("r2", 2048);
var weak = rsaKey("weak", 1024);
var ec = ecKey("e1");
var tenant = "11111111-2222-3333-4444-555555555555";

// local identity provider: discovery documents and a JWKS that can rotate
var jwksKeys = [rsa.jwk, ec.jwk];
var fetches = { jwks: 0, discovery: 0 };
var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
var base = "http://127.0.0.1:" + server.getAddress().getPort();
var issuer = base + "/realm";
function reply(exchange, status, body) {
	var bytes = new java.lang.String(body).getBytes("UTF-8");
	exchange.getResponseHeaders().add("Content-Type", "application/json");
	exchange.sendResponseHeaders(status, bytes.length);
	exchange.getResponseBody().write(bytes);
	exchange.close();
}
server.createContext("/", new com.sun.net.httpserver.HttpHandler({
	handle: function (exchange) {
		var path = String(exchange.getRequestURI().getPath());
		if (path === "/realm/.well-known/openid-configuration") {
			fetches.discovery++;
			reply(exchange, 200, JSON.stringify({ issuer: issuer, jwks_uri: base + "/jwks" }));
		} else if (path === "/common/.well-known/openid-configuration") {
			reply(exchange, 200, JSON.stringify({ issuer: base + "/{tenantid}/v2.0", jwks_uri: base + "/jwks" }));
		} else if (path === "/jwks") {
			fetches.jwks++;
			reply(exchange, 200, JSON.stringify({ keys: jwksKeys }));
		} else if (path === "/redirect") {
			exchange.getResponseHeaders().add("Location", base + "/jwks");
			reply(exchange, 302, "{}");
		} else {
			reply(exchange, 404, "{}");
		}
	}
}));
server.start();

try {
	var claims = { iss: issuer, aud: "client-1", sub: "user-1", iat: now - 10, exp: now + 600 };
	function withClaims(changes) {
		var copy = JSON.parse(JSON.stringify(claims));
		Object.keys(changes).forEach(function (name) {
			if (changes[name] === undefined) {
				delete copy[name];
			} else {
				copy[name] = changes[name];
			}
		});
		return copy;
	}
	var accessToken = "access-token-value";
	var signed = sign(rsa, claims);
	var parts = signed.split(".");
	var tampered = parts[0] + "." + b64json(withClaims({ sub: "someone-else" })) + "." + parts[2];
	var inline = { keys: [rsa.jwk, ec.jwk, weak.jwk] };

	var cases = [
		{ name: "valid", props: { token: signed, jwks: inline, issuer: issuer, clientId: "client-1", requiredClaims: ["sub", "iat"] }, ok: true },
		{ name: "es256", props: { token: sign(ec, claims), jwks: inline, algorithms: ["ES256"] }, ok: true },
		{ name: "es256NotAccepted", props: { token: sign(ec, claims), jwks: inline }, error: "JWT algorithm ES256 is not accepted" },
		{ name: "tampered", props: { token: tampered, jwks: inline }, error: "JWT signature is invalid" },
		{ name: "none", props: { token: b64json({ alg: "none" }) + "." + b64json(claims) + ".c2ln", jwks: inline, algorithms: ["none", "RS256"] },
			error: "JWT algorithm none is not accepted" },
		{ name: "hs256", props: { token: b64json({ alg: "HS256", kid: "r1" }) + "." + b64json(claims) + ".c2ln", jwks: inline, algorithms: ["HS256"] },
			error: "JWT algorithm HS256 is not accepted" },
		{ name: "weakKey", props: { token: sign(weak, claims), jwks: inline }, error: "JWT signature is invalid" },
		{ name: "unknownKid", props: { token: sign(rotated, claims), jwks: inline }, error: "no signing key matches the JWT" },
		{ name: "expired", props: { token: sign(rsa, withClaims({ exp: now - 400 })), jwks: inline }, error: "JWT is expired" },
		{ name: "expiredWithinSkew", props: { token: sign(rsa, withClaims({ exp: now - 100 })), jwks: inline }, ok: true },
		{ name: "noSkew", props: { token: sign(rsa, withClaims({ exp: now - 100 })), jwks: inline, clockSkewSeconds: 0 }, error: "JWT is expired" },
		{ name: "noExp", props: { token: sign(rsa, withClaims({ exp: undefined })), jwks: inline }, error: "JWT exp is missing" },
		{ name: "notYetValid", props: { token: sign(rsa, withClaims({ nbf: now + 900 })), jwks: inline }, error: "JWT is not valid yet" },
		{ name: "iatFuture", props: { token: sign(rsa, withClaims({ iat: now + 900 })), jwks: inline }, error: "JWT iat is missing or in the future" },
		{ name: "iatRequired", props: { token: sign(rsa, withClaims({ iat: undefined })), jwks: inline, requiredClaims: ["iat"] },
			error: "JWT iat is missing or in the future" },
		{ name: "subRequired", props: { token: sign(rsa, withClaims({ sub: "" })), jwks: inline, requiredClaims: "sub" }, error: "JWT sub is missing" },
		{ name: "issuer", props: { token: signed, jwks: inline, issuer: "https://other" }, error: "JWT issuer is not accepted" },
		{ name: "issuerList", props: { token: signed, jwks: inline, issuer: ["https://other", issuer] }, ok: true },
		{ name: "clientId", props: { token: signed, jwks: inline, clientId: "client-2" }, error: "JWT audience does not contain the client id" },
		{ name: "azp", props: { token: sign(rsa, withClaims({ aud: ["client-1", "api"] })), jwks: inline, clientId: "client-1" },
			error: "JWT azp is not the client id" },
		{ name: "azpOk", props: { token: sign(rsa, withClaims({ aud: ["client-1", "api"], azp: "client-1" })), jwks: inline, clientId: "client-1" }, ok: true },
		{ name: "audience", props: { token: signed, jwks: inline, audience: ["api", "other"] }, error: "JWT audience is not accepted" },
		{ name: "audienceOk", props: { token: sign(rsa, withClaims({ aud: ["api", "x"] })), jwks: inline, audience: "other, api" }, ok: true },
		{ name: "atHash", props: { token: sign(rsa, withClaims({ at_hash: atHash(accessToken) })), jwks: inline, accessToken: accessToken }, ok: true },
		{ name: "atHashMismatch", props: { token: sign(rsa, withClaims({ at_hash: atHash("other") })), jwks: inline, accessToken: accessToken },
			error: "JWT at_hash does not match the access token" },
		{ name: "atHashMissing", props: { token: signed, jwks: inline, accessToken: accessToken }, error: "JWT at_hash does not match the access token" },
		{ name: "noKeySource", props: { token: signed }, error: "jwks, jwksUri, discovery or secret is required" },
		{ name: "notJwt", props: { token: "opaque-token", jwks: inline }, error: "token is not a signed compact JWT" },
		{ name: "missing", props: { token: "", jwks: inline }, error: "token is missing" },
		{ name: "discovery", props: { token: signed, discovery: issuer + "/.well-known/openid-configuration", clientId: "client-1" }, ok: true },
		{ name: "discoveryIssuerMismatch", props: { token: signed, discovery: issuer + "/.well-known/openid-configuration", issuer: "https://other" },
			error: "discovery issuer does not match the expected issuer" },
		{ name: "tenantTemplate", props: { token: sign(rsa, withClaims({ iss: base + "/" + tenant + "/v2.0", tid: tenant })),
			discovery: base + "/common/.well-known/openid-configuration" }, ok: true },
		{ name: "tenantTemplateBadTid", props: { token: sign(rsa, withClaims({ iss: base + "/x/v2.0", tid: "x" })),
			discovery: base + "/common/.well-known/openid-configuration" }, error: "JWT tid is invalid" },
		{ name: "jwksUri", props: { token: signed, jwksUri: base + "/jwks" }, ok: true },
		{ name: "insecureUrl", props: { token: signed, jwksUri: "http://idp.example.com/jwks" }, error: "refusing to fetch http://idp.example.com/jwks" },
		{ name: "redirectRefused", props: { token: signed, jwksUri: base + "/redirect" }, error: "cannot fetch " + base + "/redirect: HTTP 302 from " + base + "/redirect" },
		{ name: "templates", props: { token: "{{ input.token }}", jwks: "{{ input.jwks }}", issuer: "{{ input.issuers }}", clientId: "{{ input.clientId }}" }, ok: true }
	];

	var nodes = cases.map(function (testCase) {
		return { id: testCase.name, block: "jwt.verify", props: testCase.props, out: "result." + testCase.name };
	});
	nodes.push({ id: "decoded", block: "jwt.decode", props: { token: tampered }, out: "result.decoded" });
	nodes.push({ id: "decodeOpaque", block: "jwt.decode", props: { token: "opaque" }, out: "result.decodeOpaque" });
	var run = JSON.parse(engine.run(JSON.stringify({
		definition: { version: 1, nodes: nodes },
		input: { token: signed, jwks: inline, issuers: [issuer], clientId: "client-1" },
		includeTrace: false
	})));
	assertTrue(run.ok === true, "jwt Flow failed: " + JSON.stringify(run).substring(0, 2000));
	cases.forEach(function (testCase) {
		var out = run.result[testCase.name];
		if (testCase.ok) {
			assertTrue(out && out.ok === true && out.claims && out.claims.sub, testCase.name + " should be trusted: " + JSON.stringify(out));
		} else {
			assertTrue(out && out.ok === false && out.error === testCase.error && out.claims === undefined,
				testCase.name + " should be refused with '" + testCase.error + "': " + JSON.stringify(out));
		}
	});
	assertTrue(run.result.valid.header.kid === "r1" && run.result.valid.claims.aud === "client-1", "verified header and claims are returned");
	assertTrue(run.result.decoded.ok === true && run.result.decoded.claims.sub === "someone-else" && run.result.decoded.header.alg === "RS256",
		"jwt.decode reads an unverified token: " + JSON.stringify(run.result.decoded));
	assertTrue(run.result.decodeOpaque.ok === false && run.result.decodeOpaque.error === "token is not a signed compact JWT",
		"jwt.decode refuses an opaque token: " + JSON.stringify(run.result.decodeOpaque));

	// discovery and JWKS are cached; an unknown kid refreshes the JWKS once a minute at most
	assertTrue(fetches.discovery === 1, "the discovery document is fetched once: " + fetches.discovery);
	var jwt = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "lib/jwt-verify.js"), "UTF-8")));
	jwt.clearCache();
	fetches.jwks = 0;
	var options = { token: signed, jwksUri: base + "/jwks" };
	assertTrue(jwt.verify(options).ok && jwt.verify(options).ok && fetches.jwks === 1, "the JWKS is cached: " + fetches.jwks);
	// a rotated key is fetched once the last download is a minute old
	var real = jwt.platform, offset = 0, clock = {};
	Object.keys(real).forEach(function (name) { clock[name] = real[name]; });
	clock.now = function () { return real.now() + offset; };
	jwt.platform = clock;
	jwksKeys = [rotated.jwk];
	assertTrue(jwt.verify({ token: sign(rotated, claims), jwksUri: base + "/jwks" }).ok === false && fetches.jwks === 1,
		"the JWKS is not refreshed within a minute of its download: " + fetches.jwks);
	offset = 61 * 1000;
	var afterRotation = jwt.verify({ token: sign(rotated, claims), jwksUri: base + "/jwks" });
	assertTrue(afterRotation.ok === true && fetches.jwks === 2, "an unknown kid refreshes the JWKS: " + JSON.stringify(afterRotation) + " " + fetches.jwks);
	var unknown = jwt.verify({ token: sign(weak, claims), jwksUri: base + "/jwks" });
	assertTrue(unknown.ok === false && fetches.jwks === 2, "the JWKS is refreshed at most once a minute: " + fetches.jwks);

	var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "jwt", detail: "full" })));
	var verifyBlock = catalog.blocks.filter(function (item) { return item.blockId === "jwt.verify"; })[0];
	assertTrue(verifyBlock && verifyBlock.outputs.out.properties.ok.type === "boolean" && verifyBlock.props.discovery.kind === "template",
		"catalog exposes jwt.verify");
	assertTrue(catalog.blocks.some(function (item) { return item.blockId === "jwt.decode"; }), "catalog exposes jwt.decode");
} finally {
	server.stop(0);
}

print("jwt-blocks OK");
