// text.match, text.split, date.iso and the oneOf / overlaps expression functions, on Rhino and in the browser implementations.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-text-match-split-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var guid = "11111111-2222-3333-4444-555555555555";
var nodes = [
	{ id: "tenant", block: "text.match", props: { text: "https://login.microsoftonline.com/" + guid + "/v2.0",
		pattern: "^https://(?:login\\.microsoftonline\\.com/([0-9a-f-]{36})/v2\\.0|sts\\.windows\\.net/([0-9a-f-]{36})/)$" }, out: "result.tenant" },
	{ id: "noMatch", block: "text.match", props: { text: "https://evil.example/" + guid + "/v2.0", pattern: "^https://login\\.microsoftonline\\.com/" }, out: "result.noMatch" },
	{ id: "caseless", block: "text.match", props: { text: "HTTPS://X", pattern: "^https://", ignoreCase: true }, out: "result.caseless" },
	{ id: "templated", block: "text.match", props: { text: "{{ input.id }}", pattern: "{{ input.pattern }}" }, out: "result.templated" },
	{ id: "split", block: "text.split", props: { text: " a, b ,, c ", separator: "," }, out: "result.split" },
	{ id: "splitRaw", block: "text.split", props: { text: "a;;b ", separator: ";", trim: false, removeEmpty: false }, out: "result.splitRaw" },
	{ id: "splitEmpty", block: "text.split", props: { text: "{{ input.missing }}" }, out: "result.splitEmpty" },
	{ id: "isoNow", block: "date.iso", props: {}, out: "result.isoNow" },
	{ id: "isoMillis", block: "date.iso", props: { value: 0 }, out: "result.isoMillis" },
	{ id: "isoText", block: "date.iso", props: { value: "2026-10-13T16:42:08+02:00" }, out: "result.isoText" },
	{ id: "isoInvalid", block: "date.iso", props: { value: "not a date" }, out: "result.isoInvalid" },
	{ id: "oneOfList", block: "set", props: { path: "result.oneOfList", value: "{{ oneOf(\"client-1\", input.audList) }}" } },
	{ id: "oneOfScalar", block: "set", props: { path: "result.oneOfScalar", value: "{{ oneOf(\"client-1\", input.aud) }}" } },
	{ id: "oneOfPrefix", block: "set", props: { path: "result.oneOfPrefix", value: "{{ oneOf(\"client\", input.aud) }}" } },
	{ id: "oneOfMissing", block: "set", props: { path: "result.oneOfMissing", value: "{{ oneOf(\"client-1\", input.missing) }}" } },
	{ id: "overlaps", block: "set", props: { path: "result.overlaps", value: "{{ overlaps(input.audList, input.accepted) }}" } },
	{ id: "overlapsScalar", block: "set", props: { path: "result.overlapsScalar", value: "{{ overlaps(input.aud, input.accepted) }}" } },
	{ id: "overlapsNone", block: "set", props: { path: "result.overlapsNone", value: "{{ overlaps(input.audList, input.missing) }}" } }
];
var run = JSON.parse(engine.run(JSON.stringify({
	definition: { version: 1, nodes: nodes },
	input: { id: "00AB-cd", pattern: "^[0-]*(.*)$", aud: "client-1", audList: ["api", "client-1"], accepted: ["x", "client-1"] },
	includeTrace: false
})));
assertTrue(run.ok === true, "Flow failed: " + JSON.stringify(run).substring(0, 2000));
var r = run.result;
assertTrue(r.tenant.matched === true && r.tenant.groups.length === 3 && r.tenant.groups[1] === guid && r.tenant.groups[2] === "",
	"text.match captures groups, an unmatched group is empty: " + JSON.stringify(r.tenant));
assertTrue(r.noMatch.matched === false && r.noMatch.groups.length === 0, "text.match without match: " + JSON.stringify(r.noMatch));
assertTrue(r.caseless.matched === true, "text.match ignores case on demand");
assertTrue(r.templated.groups[1] === "AB-cd", "text.match renders its templates: " + JSON.stringify(r.templated));
assertTrue(JSON.stringify(r.split) === '["a","b","c"]', "text.split trims and drops empty items: " + JSON.stringify(r.split));
assertTrue(JSON.stringify(r.splitRaw) === '["a","","b "]', "text.split keeps raw items on demand: " + JSON.stringify(r.splitRaw));
assertTrue(JSON.stringify(r.splitEmpty) === "[]", "text.split of an empty text: " + JSON.stringify(r.splitEmpty));
assertTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.isoNow), "date.iso now: " + r.isoNow);
assertTrue(r.isoMillis === "1970-01-01T00:00:00.000Z" && r.isoText === "2026-10-13T14:42:08.000Z" && r.isoInvalid === "",
	"date.iso converts millis and texts: " + JSON.stringify([r.isoMillis, r.isoText, r.isoInvalid]));
assertTrue(r.oneOfList === true && r.oneOfScalar === true && r.oneOfPrefix === false && r.oneOfMissing === false,
	"oneOf compares whole items, a single value is a list of one: " + JSON.stringify([r.oneOfList, r.oneOfScalar, r.oneOfPrefix, r.oneOfMissing]));
assertTrue(r.overlaps === true && r.overlapsScalar === true && r.overlapsNone === false,
	"overlaps: " + JSON.stringify([r.overlaps, r.overlapsScalar, r.overlapsNone]));

function browser(file) {
	return eval("(" + String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, file), "UTF-8")) + ")");
}
var match = browser("blocks/text/match.browser.js")({ text: "https://login.microsoftonline.com/" + guid + "/v2.0", pattern: nodes[0].props.pattern });
assertTrue(JSON.stringify(match) === JSON.stringify(r.tenant), "browser text.match: " + JSON.stringify(match));
assertTrue(JSON.stringify(browser("blocks/text/split.browser.js")({ text: " a, b ,, c " })) === '["a","b","c"]', "browser text.split");
assertTrue(browser("blocks/date/iso.browser.js")({ value: 0 }) === "1970-01-01T00:00:00.000Z", "browser date.iso");

print("text-match-split-blocks OK");
