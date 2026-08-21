var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

function extract(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assertTrue(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}

var frontendDevTerminal = extract("frontendDevTerminal", "frontendConnects");
var frontendDevStateTimestamp = extract("frontendDevStateTimestamp", "frontendPersistedDevStateWins");
var frontendPersistedDevStateWins = extract("frontendPersistedDevStateWins", "frontendReconcileDevEntry");

var stalePrepared = {
	status: "prepared",
	pid: 2170,
	startedAt: "2026-08-21T10:00:00.000Z"
};
var activeVite = {
	status: "running",
	pid: 5720,
	startedAt: "2026-08-21T10:00:01.000Z",
	_stateModifiedAt: Date.parse("2026-08-21T10:00:02.000Z")
};
assertTrue(frontendPersistedDevStateWins(stalePrepared, activeVite, true, true),
	"newer persisted Vite must replace stale prepared runtime state");
assertTrue(!frontendPersistedDevStateWins(activeVite, stalePrepared, true, true),
	"older preparation must not replace active Vite state");

var stopped = {
	status: "stopped",
	pid: 5720,
	stoppedAt: "2026-08-21T10:00:03.000Z",
	_stateModifiedAt: Date.parse("2026-08-21T10:00:03.000Z")
};
assertTrue(frontendPersistedDevStateWins(activeVite, stopped, true, false),
	"newer persisted stop must invalidate active runtime state");

print("frontend-dev-state-reconciliation OK");
