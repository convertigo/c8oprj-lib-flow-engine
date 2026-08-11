var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var moduleFile = new java.io.File(engineDir, "modules/runtime-handle-utils.js");
var moduleSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(moduleFile, "UTF-8"));
var primitiveFastPath =
	'\t\tvar valueType = typeof value;\n' +
	'\t\tif (valueType === "string" || valueType === "boolean" || valueType === "number") {\n' +
	'\t\t\treturn value;\n' +
	'\t\t}\n';
if (moduleSource.indexOf(primitiveFastPath) === -1) {
	throw new Error("Primitive jsValue fast path not found in runtime-handle-utils.js.");
}
var baselineHandles = eval(moduleSource.replace(primitiveFastPath, ""));
var candidateHandles = eval(moduleSource);
var JavaSystem = Packages.java.lang.System;
var env = {
	raise: function (code, message) {
		var error = new Error(message);
		error.code = code;
		throw error;
	},
	NativeJavaObject: Packages.org.mozilla.javascript.NativeJavaObject,
	JavaString: Packages.java.lang.String,
	JavaBoolean: Packages.java.lang.Boolean,
	JavaNumber: Packages.java.lang.Number
};

function median(values) {
	values = values.slice().sort(function (left, right) { return left - right; });
	var middle = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function buildEnvelope(rowCount) {
	var items = [];
	var text = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
	for (var index = 0; index < rowCount; index++) {
		items.push({
			id: index,
			enabled: index % 2 === 0,
			name: "item-" + index,
			text: text,
			tags: ["flow", "runtime", "bench", String(index % 17)],
			metrics: { minimum: index - 1, current: index, maximum: index + 1 }
		});
	}
	return { ok: true, result: { items: items, count: items.length, meta: { source: "response-cost", complete: true } } };
}

var sink = 0;

function serialize(runtimeHandles, envelope) {
	var json = JSON.stringify(runtimeHandles.sanitizeSerializable(envelope, "result", env));
	sink += json.length;
	return json;
}

function runBatch(runtimeHandles, envelope, iterations) {
	var started = JavaSystem.nanoTime();
	for (var index = 0; index < iterations; index++) {
		serialize(runtimeHandles, envelope);
	}
	return Number(JavaSystem.nanoTime() - started) / 1000000 / iterations;
}

function benchmark(rowCount, iterations) {
	var envelope = buildEnvelope(rowCount);
	var baselineJson = serialize(baselineHandles, envelope);
	var candidateJson = serialize(candidateHandles, envelope);
	if (baselineJson !== candidateJson) {
		throw new Error("Candidate output differs from baseline for " + rowCount + " rows.");
	}
	for (var warmup = 0; warmup < 2; warmup++) {
		runBatch(baselineHandles, envelope, Math.max(1, Math.floor(iterations / 4)));
		runBatch(candidateHandles, envelope, Math.max(1, Math.floor(iterations / 4)));
	}
	var baselineSamples = [];
	var candidateSamples = [];
	for (var sample = 0; sample < 8; sample++) {
		JavaSystem.gc();
		if (sample % 2 === 0) {
			baselineSamples.push(runBatch(baselineHandles, envelope, iterations));
			candidateSamples.push(runBatch(candidateHandles, envelope, iterations));
		} else {
			candidateSamples.push(runBatch(candidateHandles, envelope, iterations));
			baselineSamples.push(runBatch(baselineHandles, envelope, iterations));
		}
	}
	var baselineMs = median(baselineSamples);
	var candidateMs = median(candidateSamples);
	return {
		rows: rowCount,
		jsonBytes: new Packages.java.lang.String(baselineJson).getBytes("UTF-8").length,
		iterations: iterations,
		baselineMs: baselineMs,
		candidateMs: candidateMs,
		gainMs: baselineMs - candidateMs,
		gainShare: baselineMs > 0 ? (baselineMs - candidateMs) / baselineMs : 0
	};
}

var cases = [
	{ rows: 1, iterations: 2000 },
	{ rows: 32, iterations: 200 },
	{ rows: 256, iterations: 30 },
	{ rows: 2048, iterations: 3 },
	{ rows: 4096, iterations: 1 }
];

print(JSON.stringify({
	schemaVersion: 1,
	runtime: "Rhino " + String(Packages.org.mozilla.javascript.Context.getCurrentContext().getImplementationVersion()),
	results: cases.map(function (item) { return benchmark(item.rows, item.iterations); }),
	sink: sink
}));
