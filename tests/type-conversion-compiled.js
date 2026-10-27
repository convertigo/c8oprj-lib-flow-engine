// The conversions prepared once per declaration (input contract of a plan) give the results of convert / convertReference.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "modules/type-conversion.js"), "UTF-8"));
var conversion = eval(source);
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var schemas = [
	{}, { type: "" }, { type: "any" }, { type: "unknown" }, { type: "string" }, { type: "integer" }, { type: "number" },
	{ type: "boolean" }, { type: "object" }, { type: "array" }, { type: "null" }, { type: "string|null" }, { type: "integer|string" },
	{ type: "number|boolean" }, { type: ["integer", "null"] }, { type: "boolean|any" }, { type: "array", items: { type: "integer" } },
	{ type: "array", items: { type: "array", items: { type: "boolean" } } }, { type: "object|array" }, { type: " integer | number " }
];
var values = [undefined, null, "", " ", "0", "1", "-4.7", "4.2", "42", "1e3", "abc", "true", "FALSE", "null", "[1,2]", "[\"3\",\"x\"]",
	"{\"a\":1}", "{bad", "9007199254740993", 0, 1, -4.7, 42, 2.5, NaN, Infinity, true, false, [], [1, "2", 3.5], [[true, "0"]],
	{}, { a: 1 }, new java.lang.String("7"), java.lang.Integer.valueOf(3)];
schemas.forEach(function (schema) {
	Object.freeze(schema);
	var direct = conversion.compile(schema), reference = conversion.compileReference(schema);
	values.forEach(function (value, index) {
		var expected = JSON.stringify(conversion.convert(value, schema)), actual = JSON.stringify(direct(value));
		assert(expected === actual, "convert " + JSON.stringify(schema) + " #" + index + ": " + expected + " / " + actual);
		var expectedReference = conversion.convertReference(value, schema), actualReference = reference(value);
		assert(JSON.stringify(expectedReference) === JSON.stringify(actualReference),
			"convertReference " + JSON.stringify(schema) + " #" + index + ": " + JSON.stringify(expectedReference) + " / " + JSON.stringify(actualReference));
		// an unchanged canonical tree is kept by reference, as convertReference keeps it
		assert((expectedReference.value === value) === (actualReference.value === value) || value !== value,
			"Same identity for #" + index + " with " + JSON.stringify(schema));
	});
});
print("type conversion prepared OK (" + checks + " checks)");
