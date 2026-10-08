// The frontbuilder locks are shared by every Rhino scope of the server: the Convertigo bridge runs a production build
// on another runtime than the authoring one, so the builder packages, the generated application of a project and the
// production builds are guarded server-wide, not per scope. The build command tells the bridge it needs no authoring
// state (authoring: false).
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

// the shared server map of Convertigo, seen by two scopes
var serverMap = new java.util.concurrent.ConcurrentHashMap();

/** @return the lock functions of one scope */
function scope() {
	var ConcurrentHashMap = java.util.concurrent.ConcurrentHashMap;
	var ReentrantLock = java.util.concurrent.locks.ReentrantLock;
	var localSharedLocks = new ConcurrentHashMap();
	var SHARED_LOCKS_KEY = "flow.frontbuilder.locks";
	var File = java.io.File;
	function sharedServerJavaMap(key) {
		serverMap.putIfAbsent(key, new ConcurrentHashMap());
		return serverMap.get(key);
	}
	function canonicalPath(file) { return String(file.getCanonicalPath()); }
	function frontendProjectRootFile(request) { return new File(String(request.projectDir)); }
	var sharedLock = eval(functionSource("sharedLock"));
	var frontendProductionBuildLock = sharedLock("productionBuilds");
	var held = [];
	function heldLocks() {
		return {
			production: frontendProductionBuildLock.isHeldByCurrentThread(),
			project: sharedLock("frontendActions:" + canonicalPath(new File("/tmp/projectA"))).isHeldByCurrentThread(),
			dependencies: sharedLock("builderDependencies").isHeldByCurrentThread()
		};
	}
	function frontendRunActionLocked(request, blocks, action) { held.push(action + ":" + JSON.stringify(heldLocks())); return { ok: true }; }
	function frontendRunStepLocked(stepAction) { held.push(stepAction + ":" + JSON.stringify(heldLocks())); return { ok: true }; }
	var frontendBuilderDependencyLock = eval(functionSource("frontendBuilderDependencyLock"));
	var frontendProjectActionLock = eval(functionSource("frontendProjectActionLock"));
	return {
		sharedLock: sharedLock,
		held: held,
		production: frontendProductionBuildLock,
		runAction: eval(functionSource("frontendRunAction")),
		runStep: eval(functionSource("frontendRunStep"))
	};
}

var first = scope();
var second = scope();
assertTrue(first.production === second.production, "the production build lock is the same in every scope");
assertTrue(first.sharedLock("builderDependencies") === second.sharedLock("builderDependencies"),
	"and the builder packages lock");

var request = { projectDir: "/tmp/projectA" };
first.runAction(request, [], "build");
first.runAction(request, [], "generate");
first.runStep("installBuilder");
first.runStep("build");
assertTrue(first.held[0] === 'build:{"production":true,"project":true,"dependencies":false}',
	"a build holds the production lock and the lock of its project: " + first.held[0]);
assertTrue(first.held[1] === 'generate:{"production":false,"project":true,"dependencies":false}',
	"another action only the lock of its project: " + first.held[1]);
assertTrue(first.held[2] === 'installBuilder:{"production":false,"project":false,"dependencies":true}',
	"the builder packages are installed under their lock: " + first.held[2]);
assertTrue(first.held[3] === 'build:{"production":false,"project":false,"dependencies":false}',
	"another step takes no lock: " + first.held[3]);
assertTrue(!first.production.isLocked(), "every lock is released");

// a build in progress in one scope makes the other scope wait
var ready = new java.util.concurrent.CountDownLatch(1);
var release = new java.util.concurrent.CountDownLatch(1);
var thread = new java.lang.Thread(function () {
	first.production.lock();
	try {
		ready.countDown();
		release.await();
	} finally {
		first.production.unlock();
	}
});
thread.start();
ready.await();
assertTrue(!second.production.tryLock(), "the other scope cannot build while the first one does");
release.countDown();
thread.join();
assertTrue(second.production.tryLock(), "then it can");
second.production.unlock();

// the build command runs out of the authoring lock of the bridge
function contextMenuItem(id, label, description, group, payload, confirm, icon, enabled) {
	return { id: id, label: label, enabled: enabled !== false, payload: payload || {} };
}
var frontendBuilderCommands = eval(functionSource("frontendBuilderCommands"));
var commands = frontendBuilderCommands({ name: "svelte" }, true, false);
assertTrue(commands.build.authoring === false, "the build command needs no authoring state");
assertTrue(commands.serve.authoring === undefined && commands.generate.authoring === undefined,
	"the others keep the authoring runtime");

print("frontend-action-locks: shared locks, order and build command OK");
