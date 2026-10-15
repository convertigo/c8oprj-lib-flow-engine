// jwt.sign and jwt.verify with a shared secret: tokens issued by this server, refused by a key
// set and by another secret, expiry and algorithm rules.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-jwt-sign-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function run(nodes, input) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
}

function one(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === true, block + " failed: " + JSON.stringify(out).substring(0, 1500));
	return out.result.it;
}

function error(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === false && out.error, block + " should fail: " + JSON.stringify(out).substring(0, 1500));
	return out.error;
}

var SECRET = "a-shared-secret-of-at-least-32-characters";
var now = Math.floor(Number(java.lang.System.currentTimeMillis()) / 1000);

var token = one("jwt.sign", { claims: { sub: "ada", scope: "app" }, secret: SECRET, expiresInSeconds: 3600 });
assertTrue(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), "a compact token: " + token);
var decoded = one("jwt.decode", { token: token });
assertTrue(decoded.ok === true && decoded.header.alg === "HS256" && decoded.header.typ === "JWT", "HS256 header: " + JSON.stringify(decoded));
assertTrue(decoded.claims.sub === "ada" && decoded.claims.scope === "app" && decoded.claims.exp - decoded.claims.iat === 3600 && Math.abs(decoded.claims.iat - now) < 10,
	"claims with iat and exp: " + JSON.stringify(decoded.claims));

var verified = one("jwt.verify", { token: token, secret: SECRET });
assertTrue(verified.ok === true && verified.claims.sub === "ada", "verified with the secret: " + JSON.stringify(verified));
var otherSecret = one("jwt.verify", { token: token, secret: "another-secret-of-at-least-32-chars" });
assertTrue(otherSecret.ok === false && otherSecret.error === "JWT signature is invalid", "another secret is refused: " + JSON.stringify(otherSecret));
var tampered = token.substring(0, token.lastIndexOf(".") + 1) + "AAAA" + token.substring(token.lastIndexOf(".") + 5);
assertTrue(one("jwt.verify", { token: tampered, secret: SECRET }).ok === false, "a tampered signature is refused");
var wrongAlgorithm = one("jwt.verify", { token: token, secret: SECRET, algorithms: ["HS512"] });
assertTrue(wrongAlgorithm.ok === false && /not accepted/.test(wrongAlgorithm.error), "the algorithm must be accepted: " + JSON.stringify(wrongAlgorithm));
var keySet = one("jwt.verify", { token: token, jwks: { keys: [{ kty: "oct", k: "AAAA" }] } });
assertTrue(keySet.ok === false && /not accepted/.test(keySet.error), "a key set never verifies an HMAC token: " + JSON.stringify(keySet));
var noSource = one("jwt.verify", { token: token });
assertTrue(noSource.ok === false && /secret is required/.test(noSource.error), "a key source or a secret is required: " + JSON.stringify(noSource));
var issuerChecked = one("jwt.verify", { token: one("jwt.sign", { claims: { sub: "ada", iss: "https://issuer.example", aud: "app-1" }, secret: SECRET, expiresInSeconds: 600 }), secret: SECRET, issuer: "https://issuer.example", audience: "app-1", requiredClaims: ["sub"] });
assertTrue(issuerChecked.ok === true, "issuer, audience and required claims apply: " + JSON.stringify(issuerChecked));
var wrongIssuer = one("jwt.verify", { token: one("jwt.sign", { claims: { sub: "ada", iss: "https://other.example" }, secret: SECRET, expiresInSeconds: 600 }), secret: SECRET, issuer: "https://issuer.example" });
assertTrue(wrongIssuer.ok === false, "another issuer is refused");

var expired = one("jwt.verify", { token: one("jwt.sign", { claims: { sub: "ada", exp: now - 1000 }, secret: SECRET }), secret: SECRET });
assertTrue(expired.ok === false && /expired/i.test(expired.error), "an expired token is refused: " + JSON.stringify(expired));
var keptExp = one("jwt.decode", { token: one("jwt.sign", { claims: { sub: "ada", exp: now + 42 }, secret: SECRET, expiresInSeconds: 3600 }) });
assertTrue(keptExp.claims.exp === now + 42, "an exp of the claims is kept");

var hs512 = one("jwt.sign", { claims: { sub: "ada" }, secret: SECRET, algorithm: "HS512", header: { kid: "2026" }, expiresInSeconds: 600 });
var hs512Decoded = one("jwt.decode", { token: hs512 });
assertTrue(hs512Decoded.header.alg === "HS512" && hs512Decoded.header.kid === "2026", "HS512 with a kid: " + JSON.stringify(hs512Decoded.header));
assertTrue(one("jwt.verify", { token: hs512, secret: SECRET, algorithms: ["HS512"] }).ok === true, "HS512 verified when accepted");
assertTrue(one("jwt.verify", { token: hs512, secret: SECRET }).ok === false, "HS512 refused by the HS256 default");

assertTrue(error("jwt.sign", { claims: { sub: "ada" }, secret: "" }).code === "JWT_SIGN_INVALID", "a secret is required to sign");
assertTrue(error("jwt.sign", { claims: "not an object", secret: SECRET }).code === "JWT_SIGN_INVALID", "claims must be an object");
assertTrue(error("jwt.sign", { claims: { sub: "ada" }, secret: SECRET, expiresInSeconds: -5 }).code === "JWT_SIGN_INVALID", "the lifetime must be positive");

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "jwt", detail: "full" })));
var sign = catalog.blocks.filter(function (item) { return item.blockId === "jwt.sign"; })[0];
assertTrue(sign && sign.props.secret.kind === "template" && sign.props.claims.kind === "value", "catalog exposes jwt.sign");
var verify = catalog.blocks.filter(function (item) { return item.blockId === "jwt.verify"; })[0];
assertTrue(verify && verify.props.secret.kind === "template", "jwt.verify exposes its secret");
print("jwt.sign: ok");
