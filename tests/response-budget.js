var engineDir = arguments.length > 0 ? arguments[0] : "libs/flow";
var serviceFile = new java.io.File(engineDir, "modules/response-budget-service.js");
var serviceSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8"));
var service = eval(serviceSource);
var now = 200;

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function raise(code, message) {
	var error = new Error(message);
	error.code = code;
	throw error;
}

var env = {
	nowMillis: function () { return now; },
	utf8Length: function (text) { return new java.lang.String(String(text)).getBytes("UTF-8").length; },
	base64UrlEncode: function (text) {
		return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
			new java.lang.String(String(text)).getBytes("UTF-8")));
	},
	base64UrlDecode: function (text) {
		return String(new java.lang.String(java.util.Base64.getUrlDecoder().decode(String(text)), "UTF-8"));
	},
	raise: raise
};

var timed = service.create({ answerBefore: 100, minItems: 1 }, { key: "query-a" }, env);
var timedItems = [];
assertTrue(timed.shouldContinue(0, { index: 0 }), "minItems did not allow one useful result after the deadline");
assertTrue(timed.tryAdd(timedItems, { id: 1 }, { index: 0 }), "first timed result was not added");
assertTrue(!timed.shouldContinue(1, { index: 1 }), "answerBefore did not interrupt the loop");
var timedOut = timed.finish({ items: timedItems, nextCursor: null }, true, { index: 1 });
assertTrue(timedOut.partial === true && timedOut.nextCursor.indexOf("rb1.") === 0 &&
	timedOut.warnings[0].code === "PARTIAL_RESULT_TIME_BUDGET",
	"timed response did not expose the partial response contract");

var resumed = service.create({ cursor: timedOut.nextCursor }, { key: "query-a" }, env);
assertTrue(resumed.cursor({ index: 0 }).index === 1, "opaque cursor did not restore the loop position");

var sized = service.create({ maxResponseKB: 1, minItems: 1 }, { key: "query-b" }, env);
var sizedItems = [];
assertTrue(sized.tryAdd(sizedItems, { text: new Array(901).join("a") }, { index: 0 }),
	"size budget did not preserve minItems");
assertTrue(!sized.tryAdd(sizedItems, { text: new Array(901).join("b") }, { index: 1 }),
	"maxResponseKB did not interrupt result generation");
var sizedOut = sized.finish({ items: sizedItems, nextCursor: null }, true, { index: 1 });
assertTrue(sizedOut.partial === true && sizedOut.warnings[0].code === "PARTIAL_RESULT_SIZE_BUDGET",
	"size-limited response did not expose its warning");

var mismatch = false;
try {
	service.create({ cursor: timedOut.nextCursor }, { key: "query-changed" }, env).cursor({ index: 0 });
} catch (e) {
	mismatch = String(e.code || "") === "RESPONSE_CURSOR_MISMATCH";
}
assertTrue(mismatch, "cursor reuse with another query was not rejected");

print(JSON.stringify({ ok: true, timed: timedOut.responseBudget, sized: sizedOut.responseBudget }));
