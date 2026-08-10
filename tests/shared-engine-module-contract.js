const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const engineSource = fs.readFileSync(path.join(root, "libs/flow/Engine.js"), "utf8");
const match = engineSource.match(/var sharedEngineModuleNames = "([^"]*)";/);
assert(match, "Engine.js must declare its explicit shared module contract");

const shared = new Set(match[1].split("|").filter(Boolean));
const modulesDir = path.join(root, "libs/flow/modules");
const moduleNames = fs.readdirSync(modulesDir).filter((name) => name.endsWith(".js")).sort();
const stateful = new Set(["flow-code-service.js", "flow-runtime-service.js"]);
const auditedClosureDeclarations = {
	"catalog-loader-service.js": ["var DEFAULT_HOT_CATALOG_PROBE_INTERVAL_MS = 60000;"],
	"flow-execution-snapshot-service.js": [
		'var FORMAT = "convertigo.flow.execution-snapshot";',
		"var VERSION = 1;"
	],
	"flow-summary-service.js": ["var SUMMARY_LIMIT = 72;"],
	// This prototype is created inside create(env), once per Engine runtime; it is not JVM-shared state.
	"graph-block-runtime-service.js": ["var graphBlockPrototype = {"],
	"response-budget-service.js": ['var CURSOR_PREFIX = "rb1.";']
};

assert.deepStrictEqual(
	[...shared].sort(),
	moduleNames.filter((name) => !stateful.has(name)),
	"every stateless module must be explicit in the machine image and stateful modules must stay local"
);

for (const name of shared) {
	const source = fs.readFileSync(path.join(modulesDir, name), "utf8");
	const topLevelState = source.split(/\r?\n/)
		.filter((line) => /^\t(?:var|let|const) /.test(line))
		.map((line) => line.trim());
	assert.deepStrictEqual(
		topLevelState,
		auditedClosureDeclarations[name] || [],
		`${name} introduced unaudited module closure state; keep it runtime-local or update the audited contract`
	);
}

console.log(`shared-engine-module-contract OK (${shared.size} shared, ${stateful.size} local)`);
