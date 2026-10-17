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
