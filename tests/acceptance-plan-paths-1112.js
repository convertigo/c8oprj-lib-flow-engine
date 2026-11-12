// In the PCA of 11/11 an agent ran the acceptance plan of its build (navigate, probe, resize, console) and was told to
// "add one focused interaction only when a required business workflow is not covered": it looked at its pages and
// walked no workflow, and a person found a declaration impossible to save, silent refusals and a list empty after a
// return. The plan of build and openBuilt now carries the paths the Svelte provider lists beside the generated sources
// (flow-acceptance.json: writes, carried values, loads) and asks to walk them, with each acceptance criterion of the
// specification that goes through a screen. The server never runs them: the browser of the host does.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectDirFile = java.nio.file.Files.createTempDirectory("lib-flow-engine-acceptance-paths-").toFile();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
try {
	var engine = eval(source);
	var modelDir = new java.io.File(projectDirFile, "_flow/frontbuilder/svelte/model/Orders/src/routes");
	modelDir.mkdirs();
	files.writeStringToFile(new java.io.File(modelDir, "+page.flow.svelte"),
		'<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="orders"><Structure><Text $$id="t" text="Orders" /></Structure></FlowComponent>\n', "UTF-8");
	var request = {
		project: "Orders", projectDir: __flowProjectDir, actionId: "frontbuilder.svelte.openBuilt",
		targetObject: { kind: "frontendBuilder", type: "svelte", project: "Orders" },
		engineSource: ["version: 1", "config:", "  frontbuilder:", "    svelte:", "      target: svelte5",
			"      resourceRoot: " + String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT")),
			"      modelPath: _flow/frontbuilder/svelte/model/Orders/src/routes/+page.flow.svelte", ""].join("\n")
	};

	// 1. Without a list of paths, the plan still asks for the walk of each criterion, never for "one focused interaction"
	var bare = JSON.parse(engine.contextAction(JSON.stringify(request))).acceptance;
	assert(bare && bare.strategy === "safe-playwright-plan", "the plan: " + JSON.stringify(bare));
	assert(bare.paths === undefined, "no paths without their list: " + JSON.stringify(bare.paths));
	// the acceptance table the agent wrote from the specification before building is filled by the walk (lot 1b, 12/11)
	assert(/Fill the seen column of your acceptance table \(criterion, path, seen\), written from the specification before building/.test(bare.next),
		"the next step names the acceptance table: " + bare.next);
	assert(!/one focused interaction/.test(bare.next) && /renders, not that it works/.test(bare.next)
		&& /each acceptance criterion of the specification that goes through a screen/.test(bare.next)
		&& /one refused value per form/.test(bare.next) && /Application Acceptance/.test(bare.next),
		"the next step asks for the walk: " + bare.next);

	// 2. The paths the provider listed are carried as they are
	var manifest = { version: 1, paths: [
		{ kind: "load", page: "/", calls: [".ListOrders"], once: true, prove: "Leave / and come back: its data must show again." },
		{ kind: "carry", page: "/", trigger: "Declare", to: "/declare", carries: ["items"], prove: "Go from / to /declare through \"Declare\": that page must show what it receives (items)." },
		{ kind: "write", page: "/declare", trigger: "Declaration", calls: [".Declare"], prove: "As its user, fill and submit \"Declaration\" and read the result on the screen; then submit one value the specification refuses: its message must show." }
	] };
	var generated = new java.io.File(projectDirFile, "_private/svelte");
	generated.mkdirs();
	files.writeStringToFile(new java.io.File(generated, "flow-acceptance.json"), JSON.stringify(manifest), "UTF-8");
	var plan = JSON.parse(engine.contextAction(JSON.stringify(request))).acceptance;
	assert(JSON.stringify(plan.paths) === JSON.stringify(manifest.paths), "the paths of the provider: " + JSON.stringify(plan.paths));
	assert(/walk each of paths/.test(plan.next), "the next step names the paths: " + plan.next);
	assert(plan.calls.length === 7 && plan.calls[0].tool === "browser_navigate", "the probes are unchanged");

	// 3. Each entry is read in its own format only (security review of 12/11, R1): the known fields, texts of 200
	// characters at most, lists of 20 texts at most, once a boolean; anything else, an unknown kind included, is left out
	var long = new Array(501).join("x"), many20 = [];
	for (var k = 0; k < 30; k++) many20.push(".Call" + k);
	files.writeStringToFile(new java.io.File(generated, "flow-acceptance.json"), JSON.stringify({ version: 1, paths: [
		{ kind: "write", page: "/", trigger: long, calls: many20.concat([42, { x: 1 }]), once: "yes", script: "run me", prove: "Fill." },
		{ kind: "exec", page: "/", prove: "Do something else." },
		"not an object"
	] }), "UTF-8");
	var normalized = JSON.parse(engine.contextAction(JSON.stringify(request))).acceptance.paths;
	assert(normalized.length === 1 && normalized[0].kind === "write", "only the entries of a known kind: " + JSON.stringify(normalized));
	var entry = normalized[0];
	assert(entry.trigger.length === 200 && entry.calls.length === 20 && entry.calls.every(function (c) { return typeof c === "string"; }),
		"texts and lists are bounded: " + JSON.stringify(entry).substring(0, 300));
	assert(entry.script === undefined && entry.once === undefined && entry.prove === "Fill." && entry.page === "/",
		"unknown fields and a once that is no boolean are left out: " + JSON.stringify(Object.keys(entry)));

	// 4. A list too long or unreadable is never a failure of openBuilt: at most 60 paths, nothing when it is not JSON
	var many = { version: 1, paths: [] };
	for (var i = 0; i < 80; i++) many.paths.push({ kind: "write", page: "/p" + i, trigger: "Save", calls: [".Save"], prove: "x" });
	files.writeStringToFile(new java.io.File(generated, "flow-acceptance.json"), JSON.stringify(many), "UTF-8");
	assert(JSON.parse(engine.contextAction(JSON.stringify(request))).acceptance.paths.length === 60, "60 paths at most");
	files.writeStringToFile(new java.io.File(generated, "flow-acceptance.json"), "{ not json", "UTF-8");
	var broken = JSON.parse(engine.contextAction(JSON.stringify(request)));
	assert(broken.ok === true && broken.acceptance.paths === undefined, "an unreadable list is left out: " + JSON.stringify(broken).substring(0, 300));

	print("acceptance-plan-paths-1112 OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(projectDirFile);
}
