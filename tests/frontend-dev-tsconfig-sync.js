var File = java.io.File;
var IO = Packages.org.apache.commons.io.FileUtils;
var source = String(IO.readFileToString(new File(arguments[0], "Engine.js"), "UTF-8"));
var start = source.indexOf("\n\tfunction frontendPrepareDevTsconfig(") + 2;
var end = source.indexOf("\n\tfunction ", start + 1);
if (start < 2 || end < 0) throw Error("missing dev tsconfig preparation");
var frontendPrepareDevTsconfig = eval("(" + source.substring(start, end).trim() + ")");
var root = java.nio.file.Files.createTempDirectory("dev-tsconfig-sync-").toFile();
var kit = new File(root, "node_modules/@sveltejs/kit");
var target = new File(root, "node_modules/$app/tsconfig.json");
var runs = [], creates = false, exitCode = 0;
function frontendExecutable() { return "/managed/node"; }
function frontendRunProcess(args, cwd) {
	runs.push({ args: args, cwd: String(cwd.getAbsolutePath()) });
	if (creates) IO.writeStringToFile(target, "{}", "UTF-8");
	return { output: exitCode ? "sync failed" : "synced", exitCode: exitCode };
}
function assert(value, message) { if (!value) throw Error(message); }
try {
	kit.mkdirs();
	IO.writeStringToFile(new File(kit, "package.json"), JSON.stringify({ bin: { "svelte-kit": "svelte-kit.js" } }), "UTF-8");
	IO.writeStringToFile(new File(kit, "svelte-kit.js"), "", "UTF-8");
	var missing = frontendPrepareDevTsconfig(root);
	assert(!missing.ok && /\$app\/tsconfig\.json/.test(missing.message), "missing alias must fail clearly");
	assert(runs.length === 1 && runs[0].args[2] === "sync" && runs[0].cwd === String(root.getAbsolutePath()),
		"sync runs in the generated application");
	creates = true;
	var ready = frontendPrepareDevTsconfig(root);
	assert(ready.ok && target.isFile(), "sync must create the alias before readiness");
	exitCode = 1;
	var failed = frontendPrepareDevTsconfig(root);
	assert(!failed.ok && /sync failed/.test(failed.message), "a failed sync must fail preparation");
} finally { IO.deleteQuietly(root); }
print("frontend-dev-tsconfig-sync OK");
