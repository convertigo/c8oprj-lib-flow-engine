var root = new java.io.File(arguments[0]);
var utils = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(root, "modules/scope-reference-utils.js"), "UTF-8")));
function assert(value, message) {
	if (!value) throw new Error(message);
}
function equal(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual));
}
var add = utils.createUniqueAdder();
var values = ["input", "local"];
var searches = 0;
values.indexOf = function (value) {
	searches++;
	return Array.prototype.indexOf.call(this, value);
};
add(values, "local");
add(values, "result.value");
var firstSearches = searches;
for (var repeat = 0; repeat < 1000; repeat++) {
	add(values, "local");
	add(values, "result.value");
}
assert(searches === firstSearches, "Repeated references still scanned the list");
equal(values, ["input", "local", "result.value"], "Order changed");

// A graph implementation can restore a snapshot into the same array, and a
// hook can replace entries without changing its length. Neither leaves a
// cached hit valid unless that value is still at its recorded position.
values.splice(0, values.length, "input", "result.other", "current.item");
add(values, "local");
add(values, "result.value");
equal(values, ["input", "result.other", "current.item", "local", "result.value"], "Restored paths were lost");
values.reverse();
add(values, "local");
add(values, "current.item");
equal(values, ["result.value", "local", "current.item", "result.other", "input"], "Reordered paths duplicated");
values.length = 0;
add(values, "local");
equal(values, ["local"], "Truncation left a stale hit");
values[0] = "externally.inserted";
add(values, "externally.inserted");
equal(values, ["externally.inserted"], "A new external value duplicated");

var second = ["already", "already"];
add(second, "local");
add(values, "local");
equal(second, ["already", "already", "local"], "Replacing the list changed existing entries");
equal(values, ["externally.inserted", "local"], "Replacing the list reused another index");
var isolated = utils.createUniqueAdder();
var other = [];
isolated(other, "local");
equal(other, ["local"], "An analysis reused another context's index");

var special = [];
["__proto__", "constructor", "toString", "hasOwnProperty", "__proto__", "constructor", "toString"].forEach(function (value) {
	add(special, value);
});
equal(special, ["__proto__", "constructor", "toString", "hasOwnProperty"], "Prototype keys broke membership");
[undefined, null, "", 0, false, {}, []].forEach(function (value) { add(special, value); });
equal(special, ["__proto__", "constructor", "toString", "hasOwnProperty"], "Non-reference values changed the list");
assert(Object.keys(special).join(",") === "0,1,2,3", "The index leaked into array metadata");

var batch = [], batchExpected = [], batchAdd = utils.createUniqueAdder();
var batchValues = [];
for (var n = 0; n < 300; n++) batchValues.push("local.field" + (n % 91));
batchValues.push("__proto__", "constructor", "", null, false);
function baselineAll(items, values) { values.forEach(function (value) { utils.addUnique(items, value); }); }
batchAdd.all(batch, batchValues);
baselineAll(batchExpected, batchValues);
equal(batch, batchExpected, "A batch changed order or filtering");
batch.splice(0, batch.length, "new.external", "local.field44");
batchExpected.splice(0, batchExpected.length, "new.external", "local.field44");
batchAdd.all(batch, batchValues);
baselineAll(batchExpected, batchValues);
equal(batch, batchExpected, "A batch reused a stale index after restoration");
batch.reverse(); batchExpected.reverse();
batchAdd(batch, "local.field17"); utils.addUnique(batchExpected, "local.field17");
equal(batch, batchExpected, "Single additions after a batch duplicated a moved entry");
batchAdd.all(batch, ["small.batch", "local.field17", "small.batch"]);
baselineAll(batchExpected, ["small.batch", "local.field17", "small.batch"]);
equal(batch, batchExpected, "Small batches changed semantics");

var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(root, "modules/flow-analysis-service.js"), "UTF-8")));
var fields = [];
for (var n = 0; n < 30; n++) fields.push("field" + n);
var env = {
	scopeNames: ["input", "local", "result"],
	intOption: function (value, fallback) { return value === undefined ? fallback : value; },
	createUniqueAdder: utils.createUniqueAdder,
	addUnique: utils.addUnique,
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	schemaPaths: function () { return fields; },
	joinPath: function (base, leaf) { return base + "." + leaf; }
};
var context = service.createAnalysisContext({}, {}, {}, env);
context.addSchema("local.data", {type:"object"});
var expectedPaths = ["input", "local", "result", "config", "local.data"].concat(fields.map(function (field) { return "local.data." + field; }));
equal(context.paths, expectedPaths, "Context batch changed path publication");
context.paths.splice(0, context.paths.length, "local.data.field9");
context.addSchema("local.other", {type:"object"});
assert(context.paths.indexOf("local.other.field29") !== -1, "Context batch lost paths after restoring a list");
var originalAddPath = context.addPath, publications = [];
context.addPath = function (path) { publications.push(path); originalAddPath(path); };
context.addSchema("local.hook", {type:"object"});
equal(publications, ["local.hook"].concat(fields.map(function (field) { return "local.hook." + field; })), "Batch bypassed an overridden publication hook");

// Compare mixed external edits, restores, and additions against the original
// array contract. This covers same-length replacement and stale positions.
var actual = [], expected = [], indexed = utils.createUniqueAdder(), seed = 7;
for (var step = 0; step < 1500; step++) {
	seed = (seed * 16807) % 2147483647;
	var value = "local.p" + (seed % 73);
	if (step % 17 === 0) {
		actual.reverse(); expected.reverse();
	} else if (step % 13 === 0 && actual.length) {
		actual[seed % actual.length] = value; expected[seed % expected.length] = value;
	} else if (step % 11 === 0) {
		actual.splice(0, 3); expected.splice(0, 3);
	} else if (step % 31 === 0) {
		actual.length = expected.length = 0;
	}
	indexed(actual, value);
	if (expected.indexOf(value) === -1) expected.push(value);
	equal(actual, expected, "Mutation parity failed at step " + step);
}
print("scope reference unique index tests passed");

var traversalOrder=[], foreachCalls=0;
var sparse=new Array(3); sparse[1]="config.second.field";
sparse.forEach=function(callback){foreachCalls++;return Array.prototype.forEach.call(this,callback);};
var tree={first:"plain text",rows:sparse,last:"config.first config.second"};
Object.defineProperty(tree,"getter",{enumerable:true,get:function(){traversalOrder.push("getter");return "config.third.deep";}});
Object.defineProperty(tree,"hidden",{enumerable:false,get:function(){throw Error("hidden read");}});
equal(utils.collectConfigKeys(tree),["second","first","third"],"Config reference order or deduplication changed");
assert(foreachCalls===1 && traversalOrder.join(",")==="getter","Reference traversal changed array overrides or getters");
var existing=["first"];
assert(utils.collectConfigKeys({value:"xconfig.ignored config.first config.__proto__ config.$valid"},existing)===existing,"Caller reference accumulator was replaced");
equal(existing,["first","__proto__","$valid"],"Reference boundaries or special names changed");
equal(utils.collectConfigKeys([null,undefined,false,1,"config.","configuration.x"]),[],"Nonreferences were added");
