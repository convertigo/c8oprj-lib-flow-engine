var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-source-parser-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
function read(file) { return String(Packages.org.apache.commons.io.FileUtils.readFileToString(file, "UTF-8")); }
var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
function check(code) { return JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "PropertyProof", code: code }))); }
function assert(value, message) { if (!value) throw new Error(message); }
try {
	var valid = check('function PropertyProof() {\n result.id = 5\n return result\n}');
	assert(valid.ok, "Valid control: " + JSON.stringify(valid));
	var cases = [
		'json.object({ id: "same", id: "other", out: "result.object" })',
		'json.object({ id: "same", "id": "other", out: "result.object" })',
		'json.object({ id, id: "other" })',
		'json.object({ value: { id: 1, id: 2 } })'
	];
	cases.forEach(function (call) {
		var result = check('function PropertyProof() {\n' + call + '\n}');
		assert(!result.ok && JSON.stringify(result).indexOf("FLOWSCRIPT_DUPLICATE_PROPERTY") !== -1,
			"Expected explicit duplicate diagnostic: " + JSON.stringify(result));
	});
	var parser = eval(read(new java.io.File(engineDir, "modules/flow-script-parser-service.js")));
	var env = {
		normalizeTree: function (value) { return value; },
		parseYamlSource: function () { throw new Error("Expression-bearing object"); },
		raise: function (code, message) { var e = new Error(message); e.code = code; throw e; }
	};
	var parsed = parser.parseFlowScriptObjectLiteral('{ __proto__: input.id, constructor: 0, $$id: "node", id: input.id }', 7, env);
	assert(Object.prototype.hasOwnProperty.call(parsed.tokens, "__proto__"), "Prototype name lost from tokens");
	assert(Object.prototype.hasOwnProperty.call(parsed.value, "__proto__"), "Prototype name lost from fallback values");
	assert(parsed.tokens.$$id === '"node"' && parsed.tokens.id === 'input.id', "Metadata and business tokens collided");
	var compact = parser.parseFlowScriptObjectLiteral('{sourceVersion:2,id:5,disabled:false,nested:{id:0,rows:[{id:7},null,""]},scale:1e3}', 1, env).value;
	assert(compact.sourceVersion === 2 && compact.id === 5 && compact.disabled === false, "Compact object keys misparsed");
	assert(compact.nested.id === 0 && compact.nested.rows[0].id === 7 && compact.nested.rows[1] === null && compact.nested.rows[2] === "" && compact.scale === 1000, "Compact nested literal values changed");
	var expression = 'input.flag ? "a:b" : input.other ? "c" : "d"';
	var colon = parser.parseFlowScriptObjectLiteral('{ "key:colon": ' + expression + ', count: 2 }', 1, env);
	assert(colon.tokens['key:colon'] === expression && colon.value.count === 2, "Property split altered ternary expression text");
	var fields = parser.naturalFlowScriptObjectFields('{ "key:colon": ' + expression + ' }', env);
	assert(fields.length === 1 && fields[0].key === 'key:colon' && fields[0].token === expression, "Return-field split altered ternary expression text");
	print("source-parser-properties OK (Engine validation, duplicate diagnostics, prototype-safe token bags)");
} finally {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(project);
}
