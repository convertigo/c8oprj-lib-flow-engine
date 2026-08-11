var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var moduleFile = new java.io.File(engineDir, "modules/runtime-handle-utils.js");
var moduleSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(moduleFile, "UTF-8"));
var runtimeHandles = eval(moduleSource);
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
	return values[Math.floor(values.length / 2)];
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
			metrics: {
				minimum: index - 1,
				current: index,
				maximum: index + 1
			}
		});
	}
	return {
		ok: true,
		result: {
			items: items,
			count: items.length,
			meta: { source: "response-cost", complete: true }
		}
	};
}

var sink = 0;

function consume(value) {
	if (typeof value === "string") {
		sink += value.length;
	} else if (typeof value === "number") {
		sink += value;
	} else if (value && value.result && value.result.items) {
		sink += value.result.items.length;
	} else {
		sink++;
	}
}

function runBatch(operation, iterations) {
	var started = JavaSystem.nanoTime();
	for (var index = 0; index < iterations; index++) {
		consume(operation());
	}
	return Number(JavaSystem.nanoTime() - started) / 1000000 / iterations;
}

function measure(operation, iterations) {
	for (var warmup = 0; warmup < 2; warmup++) {
		runBatch(operation, Math.max(1, Math.floor(iterations / 4)));
	}
	var samples = [];
	for (var sample = 0; sample < 5; sample++) {
		samples.push(runBatch(operation, iterations));
	}
	return {
		medianMs: median(samples)
	};
}

function benchmark(rowCount, iterations) {
	var envelope = buildEnvelope(rowCount);
	var rawJson = JSON.stringify(envelope);
	var operations = {
		validate: function () {
			runtimeHandles.assertSerializable(envelope, "result", env);
			return rowCount;
		},
		sanitize: function () {
			return runtimeHandles.sanitize(envelope, env);
		},
		stringifyRaw: function () {
			return JSON.stringify(envelope);
		},
		sanitizeAndStringify: function () {
			return JSON.stringify(runtimeHandles.sanitize(envelope, env));
		},
		validateAndStringifyRaw: function () {
			runtimeHandles.assertSerializable(envelope, "result", env);
			return JSON.stringify(envelope);
		},
		validateSanitizeAndStringify: function () {
			runtimeHandles.assertSerializable(envelope, "result", env);
			return JSON.stringify(runtimeHandles.sanitize(envelope, env));
		},
		sanitizeSerializableAndStringify: function () {
			return JSON.stringify(runtimeHandles.sanitizeSerializable(envelope, "result", env));
		}
	};
	var measurements = {};
	Object.keys(operations).forEach(function (name) {
		JavaSystem.gc();
		measurements[name] = measure(operations[name], iterations);
	});
	var safe = measurements.validateSanitizeAndStringify.medianMs;
	var combined = measurements.sanitizeSerializableAndStringify.medianMs;
	var raw = measurements.validateAndStringifyRaw.medianMs;
	return {
		rows: rowCount,
		jsonBytes: new java.lang.String(rawJson).getBytes("UTF-8").length,
		iterations: iterations,
		measurements: measurements,
		cleanupUpperBoundMs: safe - raw,
		cleanupUpperBoundShare: safe > 0 ? (safe - raw) / safe : 0,
		redundantTraversalMs: safe - combined,
		redundantTraversalShare: safe > 0 ? (safe - combined) / safe : 0
	};
}

var cases = [
	{ rows: 1, iterations: 2000 },
	{ rows: 32, iterations: 200 },
	{ rows: 256, iterations: 30 },
	{ rows: 2048, iterations: 3 },
	{ rows: 4096, iterations: 1 }
];
var results = cases.map(function (item) {
	return benchmark(item.rows, item.iterations);
});

print(JSON.stringify({
	schemaVersion: 1,
	runtime: "Rhino " + String(Packages.org.mozilla.javascript.Context.getCurrentContext().getImplementationVersion()),
	results: results,
	sink: sink
}));
