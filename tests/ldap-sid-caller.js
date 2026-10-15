// ldap.sid (Active Directory security identifiers) and requestable.caller (outside a request).
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-sid-test").getAbsolutePath());
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
	assertTrue(out.ok === true, block + " failed: " + JSON.stringify(out).substring(0, 1000));
	return out.result.it;
}

function error(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === false && out.error, block + " should fail: " + JSON.stringify(out).substring(0, 1000));
	return out.error;
}

// S-1-5-21-2675315662-178584939-3677002858-1430 as Active Directory stores it (little-endian sub-authorities)
function sidBytes(revision, authority, parts) {
	var bytes = [revision, parts.length];
	for (var i = 5; i >= 0; i--) {
		bytes.push(Math.floor(authority / Math.pow(256, i)) % 256);
	}
	parts.forEach(function (part) {
		for (var j = 0; j < 4; j++) {
			bytes.push(Math.floor(part / Math.pow(256, j)) % 256);
		}
	});
	var array = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, bytes.length);
	for (var k = 0; k < bytes.length; k++) {
		array[k] = bytes[k] > 127 ? bytes[k] - 256 : bytes[k];
	}
	return String(java.util.Base64.getEncoder().encodeToString(array));
}

var user = sidBytes(1, 5, [21, 2675315662, 178584939, 3677002858, 1430]);
assertTrue(one("ldap.sid", { sid: user }) === "S-1-5-21-2675315662-178584939-3677002858-1430", "user SID");
assertTrue(one("ldap.sid", { sid: user, relativeId: "513" }) === "S-1-5-21-2675315662-178584939-3677002858-513", "primary group SID from the primaryGroupID");
assertTrue(one("ldap.sid", { sid: sidBytes(1, 5, [32, 544]) }) === "S-1-5-32-544", "built-in administrators SID");
assertTrue(error("ldap.sid", { sid: "not base64!" }).code === "LDAP_SID_INVALID", "invalid base64");
assertTrue(error("ldap.sid", { sid: "AQID" }).code === "LDAP_SID_INVALID", "too short");
assertTrue(error("ldap.sid", { sid: user, relativeId: "x" }).code === "LDAP_SID_INVALID", "relative id must be a number");

var caller = one("requestable.caller", {});
assertTrue(caller.hasRequest === false && caller.direct === false && typeof caller.project === "string", "no request in the test shell: " + JSON.stringify(caller));

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "sid", detail: "full" })));
assertTrue(catalog.blocks.some(function (item) { return item.blockId === "ldap.sid"; }), "catalog exposes ldap.sid");
var callers = JSON.parse(engine.catalog(JSON.stringify({ q: "caller", detail: "full" })));
assertTrue(callers.blocks.some(function (item) { return item.blockId === "requestable.caller"; }), "catalog exposes requestable.caller");
print("ldap.sid and requestable.caller: ok");
