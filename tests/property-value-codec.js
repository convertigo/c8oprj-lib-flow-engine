const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const codec = vm.runInNewContext(fs.readFileSync(__dirname + "/../_flow/modules/property-value-codec.js", "utf8"));
const valueType = {type: "unknown", editor: {valueEncoding: "typed", expressions: true}};
function value(text, type) { return codec.decode(text, {type}, valueType); }
assert.equal(value("7", "number"), 7);
assert.equal(value("0", "number"), 0);
assert.equal(value("false", "boolean"), false);
assert.equal(value("{{ input.flag }}", "boolean"), "{{ input.flag }}");
assert.equal(value("{{ input.n }}", "number"), "{{ input.n }}");
for (const text of ["7", "true", "null", "{}", "[]", "", " text "]) assert.equal(value(text, "string"), text);
assert.equal(value("null", "null"), null);
assert.equal(codec.decode("null", {type: "object", nullable: true}, valueType), null);
assert.equal(JSON.stringify(value('[1,false]', "array")), '[1,false]');
assert.equal(JSON.stringify(value('{"n":7}', "object")), '{"n":7}');
assert.equal(value("7", "unknown"), 7);
assert.equal(value("text", "unknown"), "text");
assert.equal(value('"7"', "unknown"), "7");
assert.equal(codec.decode("7", {kind: "expression", type: "number"}, {editor:{valueEncoding:"text"}}), "7");
assert.equal(JSON.stringify(codec.decode('{"mode":"literal","value":7}', {kind:"binding",type:"number"}, {type:"object",editor:{valueEncoding:"json"}})), '{"mode":"literal","value":7}');
for (const [text, type] of [["", "number"], ['"7"', "number"], ["false", "number"], ["1.1", "integer"], ["Infinity", "number"], ["1e999", "number"], ["0", "boolean"], ["{invalid}", "object"], ["null", "array"]]) {
  assert.throws(() => value(text, type), undefined, `${text} must not silently become a ${type}`);
}
console.log("property value codec: primitive/structured values, expressions, null, falsy and invalid values OK");
