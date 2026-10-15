// password.hash / password.verify (PBKDF2-SHA256 in the lib_UserManager format, former SHA-1
// hashes), crypto.hash, crypto.hmac, crypto.random and crypto.equals.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-crypto-test").getAbsolutePath());
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

// password.hash and password.verify
var hashed = one("password.hash", { password: "correct horse battery staple" });
assertTrue(/^pbkdf2-sha256\$210000\$[A-Za-z0-9+\/]{43}=$/.test(hashed.hash), "PBKDF2 hash format: " + JSON.stringify(hashed));
assertTrue(/^[A-Za-z0-9+\/]{43}=$/.test(hashed.salt), "32 byte base64 salt: " + hashed.salt);
var again = one("password.hash", { password: "correct horse battery staple" });
assertTrue(again.salt !== hashed.salt && again.hash !== hashed.hash, "a fresh salt every time");
var verified = one("password.verify", { password: "correct horse battery staple", hash: hashed.hash, salt: hashed.salt });
assertTrue(verified.ok === true && verified.upgrade === false, "the password verifies: " + JSON.stringify(verified));
var wrong = one("password.verify", { password: "correct horse battery stable", hash: hashed.hash, salt: hashed.salt });
assertTrue(wrong.ok === false && wrong.upgrade === false, "a wrong password is refused: " + JSON.stringify(wrong));
assertTrue(one("password.verify", { password: "", hash: hashed.hash, salt: hashed.salt }).ok === false, "an empty password is refused");
assertTrue(one("password.verify", { password: "x", hash: "", salt: hashed.salt }).ok === false, "an empty hash is refused");
assertTrue(one("password.verify", { password: "x", hash: "pbkdf2-sha256$210000$not-base64!", salt: hashed.salt }).ok === false, "a malformed hash is refused, not an error");
assertTrue(one("password.verify", { password: "x", hash: "pbkdf2-sha256$1000$" + hashed.hash.split("$")[2], salt: hashed.salt }).ok === false, "too few iterations are refused");
// the former lib_UserManager SHA-1 format: hex of SHA-1(password + "+" + salt)
var legacy = one("password.verify", { password: "test", salt: "vCmR6MTjtEp6m5altVCo+0klbbcm5fzinNasEEJCdTg=", hash: "fea793eea05936bab8247499a0e297b165b30f34" });
assertTrue(legacy.ok === true && legacy.upgrade === true, "a former SHA-1 hash verifies and asks for an upgrade: " + JSON.stringify(legacy));
var legacyWrong = one("password.verify", { password: "test2", salt: "vCmR6MTjtEp6m5altVCo+0klbbcm5fzinNasEEJCdTg=", hash: "fea793eea05936bab8247499a0e297b165b30f34" });
assertTrue(legacyWrong.ok === false, "a former SHA-1 hash refuses a wrong password");
var fewer = one("password.hash", { password: "pass", iterations: 150000 });
var fewerVerified = one("password.verify", { password: "pass", hash: fewer.hash, salt: fewer.salt });
assertTrue(fewerVerified.ok === true && fewerVerified.upgrade === true, "fewer iterations than today ask for an upgrade: " + JSON.stringify(fewerVerified));
assertTrue(error("password.hash", { password: "" }).code === "PASSWORD_EMPTY", "an empty password cannot be hashed");
assertTrue(error("password.hash", { password: "x", iterations: 10 }).code === "PASSWORD_ITERATIONS_INVALID", "iterations are bounded");

// crypto.hash
assertTrue(one("crypto.hash", { text: "abc" }) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256 hex");
assertTrue(one("crypto.hash", { text: "abc", algorithm: "sha1" }) === "a9993e364706816aba3e25717850c26c9cd0d89d", "sha1 hex");
assertTrue(one("crypto.hash", { text: "abc", encoding: "base64" }) === "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=", "sha256 base64");
assertTrue(one("crypto.hash", { text: "abc", encoding: "base64url" }) === "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0", "sha256 base64url");
assertTrue(one("crypto.hash", { text: "é" }) === one("crypto.hash", { text: "é" }) && one("crypto.hash", { text: "é" }) !== one("crypto.hash", { text: "e" }), "UTF-8 digest");

// crypto.hmac
assertTrue(one("crypto.hmac", { text: "The quick brown fox jumps over the lazy dog", secret: "key" }) === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", "HMAC-SHA256 hex");
assertTrue(one("crypto.hmac", { text: "x", secret: "key", algorithm: "sha512", encoding: "base64url" }).length === 86, "HMAC-SHA512 base64url");
assertTrue(error("crypto.hmac", { text: "x", secret: "" }).code === "CRYPTO_SECRET_REQUIRED", "an empty secret is an error");

// crypto.random
var random = one("crypto.random", {});
assertTrue(/^[A-Za-z0-9_-]{43}$/.test(random), "32 random bytes as base64url: " + random);
assertTrue(one("crypto.random", {}) !== random, "random values differ");
assertTrue(/^[0-9a-f]{32}$/.test(one("crypto.random", { bytes: 16, encoding: "hex" })), "16 random bytes as hex");
assertTrue(error("crypto.random", { bytes: 4 }).code === "CRYPTO_RANDOM_SIZE_INVALID", "too few bytes");

// crypto.equals
assertTrue(one("crypto.equals", { value: "abc", expected: "abc" }) === true, "equal values");
assertTrue(one("crypto.equals", { value: "abc", expected: "abd" }) === false, "different values");
assertTrue(one("crypto.equals", { value: "", expected: "" }) === false, "empty values never match");

// crypto.serverKey: outside a Convertigo server the passphrase is not available
assertTrue(error("crypto.serverKey", { purpose: "" }).code === "CRYPTO_PURPOSE_REQUIRED", "a purpose is required");
assertTrue(error("crypto.serverKey", { purpose: "test" }).code === "CRYPTO_SERVER_KEY_UNAVAILABLE", "no server passphrase in the test shell");

// catalog
var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "crypto", detail: "full" })));
["crypto.hash", "crypto.hmac", "crypto.random", "crypto.equals", "crypto.serverKey"].forEach(function (id) {
	assertTrue(catalog.blocks.some(function (item) { return item.blockId === id; }), "catalog exposes " + id);
});
var passwords = JSON.parse(engine.catalog(JSON.stringify({ q: "password", detail: "full" })));
["password.hash", "password.verify"].forEach(function (id) {
	assertTrue(passwords.blocks.some(function (item) { return item.blockId === id; }), "catalog exposes " + id);
});
print("crypto and password blocks: ok");
