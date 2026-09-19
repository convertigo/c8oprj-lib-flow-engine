// Rhino -> compiled Node provider contract on isolated projects, no live migration.
var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var sourceRoot = new File(arguments.length ? arguments[0] : "libs/flow").getCanonicalFile();
var providerRoot = String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!providerRoot || !new File(providerRoot, "provider-dist/frontDocumentCli.mjs").isFile()) {
	throw new Error("Set FLOW_FRONTBUILDER_RESOURCE_ROOT to a compiled provider before running this test.");
}
var temp = java.nio.file.Files.createTempDirectory("flow-frontend-layout-").toFile();
var __flowEngineDir, __flowProjectDir, __flowSourceLayout;
var checks = 0;
function assert(value, label) { checks++; if (!value) throw new Error(label); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
function write(file, text) { files.forceMkdir(file.getParentFile()); files.writeStringToFile(file, String(text), "UTF-8"); }
var layouts = eval(read(new File(sourceRoot, "modules/source-layout.js")));
try {
	["legacy", "_flow"].forEach(function (mode) {
		var paths = layouts.create(mode);
		var base = new File(temp, mode);
		var engineProject = new File(base, "lib_flow_engine");
		var engineRoot = new File(engineProject, paths.root);
		["modules", "blocks", "types", "resources"].forEach(function (dir) {
			files.copyDirectory(new File(sourceRoot, dir), new File(engineRoot, dir));
		});
		["Engine.js", "engine.yaml"].forEach(function (file) {
			files.copyFile(new File(sourceRoot, file), new File(engineRoot, file));
		});
		var project = new File(base, "LayoutFrontend");
		write(new File(project, "c8oProject.yaml"), "↑LayoutFrontend [core.Project]:\n  projectName: lib_flow_engine\n");
		write(new File(engineProject, "c8oProject.yaml"), "↑lib_flow_engine [core.Project]:\n");
		var sourceFile = new File(project, paths.path("frontbuilder/svelte/model/LayoutFrontend/src/routes/+page.flow.svelte"));
		var source = '<script module>export const _flow={sourceVersion:2,app:{id:"LayoutFrontend",title:"Layout"},'
			+ 'page:{id:"home",route:"/"},builder:{id:"svelte",generatedRoot:"_private/svelte",buildOutput:"DisplayObjects/mobile"}};</script>\n'
			+ '<FlowComponent $$id="home"><Structure><Input $$id="editor" id="business" disabled={false} /></Structure></FlowComponent>';
		write(sourceFile, source);
		var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n"
			+ "      resourceRoot: " + providerRoot + "\n      modelPath: "
			+ paths.path("frontbuilder/svelte/model/LayoutFrontend/src/routes/+page.flow.svelte") + "\n";
		write(new File(project, paths.path("engine.yaml")), engineSource);
		__flowEngineDir = String(engineRoot.getAbsolutePath());
		__flowProjectDir = String(project.getAbsolutePath());
		__flowSourceLayout = mode;
		var engine = eval(read(new File(engineRoot, "Engine.js")));
		function api(name, request) {
			return JSON.parse(engine[name](JSON.stringify(Object.assign({project:"LayoutFrontend",projectDir:__flowProjectDir,engineSource:engineSource}, request))));
		}
		try {
			var tree = api("describeTree", {target:"engine",detail:"full"});
			assert(tree.ok !== false && JSON.stringify(tree).indexOf('business') !== -1, "Rhino -> Node projection failed: " + JSON.stringify(tree));
			var mutation = api("applySourceMutation", {sourceFile:String(sourceFile.getAbsolutePath()),source:source,
				mutation:{op:"replace",path:"frontAst.slots.structure.children[0].props.id",value:"edited"}});
			assert(mutation.ok, "Rhino -> Node mutation failed: " + JSON.stringify(mutation));
			assert(mutation.source.indexOf('$$id="editor"') !== -1 && mutation.source.indexOf('id="edited"') !== -1, "Mutation flattened source identity");
			assert(read(sourceFile) === source, "Mutation response unexpectedly saved official source");
			var generated = api("contextAction", {actionId:"frontbuilder.svelte.generate",targetObject:{kind:"frontendBuilder",type:"svelte",project:"LayoutFrontend"}});
			assert(generated.ok, "Rhino -> Node generation failed: " + JSON.stringify(generated));
			var page = new File(project, "_private/svelte/src/routes/+page.svelte");
			assert(page.isFile(), "Generated page missing");
			var pageSource = read(page);
			assert(pageSource.indexOf('id="business"') !== -1 && pageSource.indexOf('$$id') === -1, "Generated property changed");
			assert(read(sourceFile) === source, "Generation overwrote source");
			var info = JSON.parse(engine.cacheInfo()).caches.frontendDocumentServer;
			assert(info.starts === 1 && info.fallbacks === 0 && info.errors === 0, "Provider contract fell back: " + JSON.stringify(info));
			print("frontend-source-layout-contract " + mode + " OK");
		} finally { engine.cacheClear(); }
	});
	print("frontend-source-layout-contract OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(temp);
}
