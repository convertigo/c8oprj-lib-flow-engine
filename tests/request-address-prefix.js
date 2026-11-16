var FileUtils = Packages.org.apache.commons.io.FileUtils;
var engineDir = new java.io.File(arguments[0]);
var __flowEngineDir = String(engineDir.getCanonicalPath());
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "address-prefix-test").getAbsolutePath());
var context = { remoteAddr: "2001:db8:1:2:abcd::1" };
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var request = { definition: { nodes: [{ id: "address", block: "rate.check", props: {
	operation: "hit", bucket: "prefix", key: "{{ request.clientAddressPrefix }}", limit: 1, windowSeconds: 60
}, out: "result.rate" }] }, context: { clientAddressPrefix: "spoofed", "X-Forwarded-For": "spoofed" }, includeTrace: false };
function hit() { return JSON.parse(engine.run(JSON.stringify(request))).result.rate; }
function assert(value, message) { if (!value) throw new Error(message); }
assert(hit().allowed, "first IPv6 address is allowed");
context.remoteAddr = "2001:db8:1:2:beef::2";
assert(!hit().allowed, "addresses in one /64 share a quota");
context.remoteAddr = "2001:db8:1:3::1";
assert(hit().allowed, "a different /64 has its own quota");
context.remoteAddr = "198.51.100.10";
assert(hit().allowed, "IPv4 address is accepted");
context.remoteAddr = "198.51.100.11";
assert(hit().allowed, "IPv4 addresses remain separate");
print("request-address-prefix OK");
