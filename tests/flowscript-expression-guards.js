// FlowScript values written as JavaScript either work as JavaScript or are refused at compile
// time, never kept as plain text: concatenations that start and end with a string, block calls
// nested in an expression, object literals in an expression, scope paths given to a text
// property, and json.field keys known at run time.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-expression-guards").toFile().getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function run(body, input) {
	var flowSource = "const _flow = { sourceVersion: 2 }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
	return JSON.parse(engine.run(JSON.stringify({ flowSource: flowSource, input: input || {}, includeTrace: false })));
}

function result(body, input) {
	var out = run(body, input);
	assertTrue(out.ok === true, "should run: " + body + "\n" + JSON.stringify(out).substring(0, 800));
	return out.result;
}

function refused(body, code) {
	var out = run(body, {});
	assertTrue(out.ok === false && out.error && out.error.code === code, "should be refused with " + code + ": " + body + "\n" + JSON.stringify(out).substring(0, 800));
	return out.error;
}

// a concatenation that starts and ends with a string literal is an expression
var concatenated = result('  local.filter = "(&(objectClass=" + input.kind + ")(" + input.member + "={dn}))"\n  return { filter: local.filter }',
	{ kind: "group", member: "member" });
assertTrue(concatenated.filter === "(&(objectClass=group)(member={dn}))", "concatenation: " + JSON.stringify(concatenated));
var mixed = result('  local.mail = "added-" + input.stamp + "@example.test"\n  return { mail: local.mail }', { stamp: "42" });
assertTrue(mixed.mail === "added-42@example.test", "string + value + string: " + JSON.stringify(mixed));
var plain = result('  local.text = "a \\" + b"\n  return { text: local.text }');
assertTrue(plain.text === "a \" + b", "a string holding an escaped quote stays one string: " + JSON.stringify(plain));
var single = result("  local.text = 'it' + \"'s\"\n  return { text: local.text }");
assertTrue(single.text === "it's", "single and double quoted strings concatenate: " + JSON.stringify(single));

// a block call nested in an expression is refused with the way out
var nested = refused('  local.expires = date.now({}) + 60000\n  return { expires: local.expires }', "FLOWSCRIPT_EXPRESSION_UNSUPPORTED");
assertTrue(/date\.now/.test(nested.hint) && /assign it to a local first/.test(nested.hint), "hint names the call: " + JSON.stringify(nested));
refused('  local.big = input.n > 3 ? text.trim({ text: input.s }) : ""\n  return { big: local.big }', "FLOWSCRIPT_EXPRESSION_UNSUPPORTED");
refused('  return { payload: json.stringify({ value: { at: date.now({}) + 1 } }) }', "FLOWSCRIPT_EXPRESSION_UNSUPPORTED");
// an object literal inside an expression is refused
var literal = refused('  local.attributes = default(input.attributes, {})\n  return { attributes: local.attributes }', "FLOWSCRIPT_EXPRESSION_UNSUPPORTED");
assertTrue(/object literal/.test(literal.hint), "hint about the object literal: " + JSON.stringify(literal));
// the supported forms keep working
var supported = result('  local.now = date.now({})\n  local.expires = local.now + 60000\n  local.empty = {}\n  local.attributes = default(input.attributes, local.empty)\n  return { ok: local.expires > local.now, attributes: local.attributes }', {});
assertTrue(supported.ok === true && JSON.stringify(supported.attributes) === "{}", "assign first, then use: " + JSON.stringify(supported));

// a scope path given to a text property is refused instead of being kept as text
refused('  local.text = asset.read({ path: input.file })\n  return { text: local.text }', "FLOWSCRIPT_TEXT_PROPERTY_PATH");

// json.field takes a key known at run time
var keyed = result('  local.attribute = json.object({ $$fields: function () {\n    json.field({ key: input.name, value: input.value })\n  } })\n  return { attribute: local.attribute }', { name: "Token", value: "AAAA" });
assertTrue(keyed.attribute && keyed.attribute.Token === "AAAA" && keyed.attribute["input.name"] === undefined, "dynamic json.field key: " + JSON.stringify(keyed));
var fixed = result('  local.attribute = json.object({ $$fields: function () {\n    json.field({ key: "title", value: input.value })\n  } })\n  return { attribute: local.attribute }', { value: "x" });
assertTrue(fixed.attribute && fixed.attribute.title === "x", "literal json.field key: " + JSON.stringify(fixed));
print("FlowScript expression guards: ok");
