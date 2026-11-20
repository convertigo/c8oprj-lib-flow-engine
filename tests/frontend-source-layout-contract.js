// Rhino -> compiled Node provider contract on isolated projects, no live migration.
var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var sourceRoot = new File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
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
	["_flow"].forEach(function (mode) {
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
		// The generation installs the builder's packages in the local working directory, which sets aside then removes
		// the node_modules of the builder project: a copy of that project (without node_modules), not the real one.
		var builderProject = new File(providerRoot).getCanonicalFile();
		while (builderProject && !new File(builderProject, "c8oProject.yaml").isFile()) {
			builderProject = builderProject.getParentFile();
		}
		assert(builderProject, "The provider is in a library project");
		var builderCopy = new File(base, builderProject.getName());
		files.copyDirectory(builderProject, builderCopy, new java.io.FileFilter({ accept: function (file) {
			var name = String(file.getName());
			return name !== "node_modules" && name !== "_private" && name !== ".git";
		} }));
		var copiedProvider = new File(builderCopy, String(builderProject.toPath().relativize(
			new File(providerRoot).getCanonicalFile().toPath())));
		var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n"
			+ "      resourceRoot: " + copiedProvider.getAbsolutePath() + "\n      modelPath: "
			+ paths.path("frontbuilder/svelte/model/LayoutFrontend/src/routes/+page.flow.svelte")
			+ "\n      privateDir: _private/svelte\n      buildOutput: DisplayObjects/mobile\n";
		write(new File(project, paths.path("engine.yaml")), engineSource);
		var LocalWorkDirectory = Packages.com.twinsoft.convertigo.engine.LocalWorkDirectory;
		var properties = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
		var localProperty = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName.LOCAL_WORK_DIRECTORY;
		var previousLocal = String(properties.getProperty(localProperty));
		properties.setProperty(localProperty, String(new File(base, "local").getAbsolutePath()));
		LocalWorkDirectory.init();
		assert(LocalWorkDirectory.isEnabled(), "The fixture uses the real host local work directory");
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
			// Match the engine's local work directory: generated sources are reached through linked _private,
			// while a saved page and a new, unpromoted route are combined in the draft overlay.
			var generatedDir = new File(project, "_private/svelte");
			assert(java.nio.file.Files.isSymbolicLink(generatedDir.toPath()), "The host relocated the generated sources");
			var localDir = new File(LocalWorkDirectory.getProjectDirectory("LayoutFrontend"), "_private/svelte");
			var promotedSource = source.replace('id="business"', 'id="promoted-business"');
			write(sourceFile, promotedSource);
			var draftRoute = new File(project, paths.path("frontbuilder/svelte/model/LayoutFrontend/src/routes/about/+page.flow.svelte"));
			var draftSource = source.replace('id:"home",route:"/"', 'id:"about",route:"/about"')
				.replace('id="business"', 'id="draft-business"');
			var drafts = {};
			drafts[String(draftRoute.getCanonicalPath())] = draftSource;
			var draftGenerated = api("contextAction", {actionId:"frontbuilder.svelte.generate",
				targetObject:{kind:"frontendBuilder",type:"svelte",project:"LayoutFrontend"}, sourceDrafts:drafts});
			assert(draftGenerated.ok, "Generation with saved and unsaved sources in a local work directory failed: " + JSON.stringify(draftGenerated));
			assert(read(page).indexOf('id="promoted-business"') !== -1, "The promoted source was generated");
			assert(new File(localDir, "src/routes/about/+page.svelte").isFile(), "The unpromoted route was generated");
			assert(read(sourceFile) === promotedSource && !draftRoute.exists(), "Generation did not promote the remaining draft");
			if (String(java.lang.System.getenv("FLOW_TEST_REAL_BUILD") || "") === "1") {
				var built = api("contextAction", {actionId:"frontbuilder.svelte.build",
					targetObject:{kind:"frontendBuilder",type:"svelte",project:"LayoutFrontend"}, sourceDrafts:drafts});
				assert(built.ok, "Production build with drafts failed: " + JSON.stringify(built));
				assert(new File(project, "DisplayObjects/mobile/index.html").isFile(), "The production application was published");
			}
			var info = JSON.parse(engine.cacheInfo()).caches.frontendDocumentServer;
			assert(info.starts === 1 && info.fallbacks === 0 && info.errors === 0, "Provider contract fell back: " + JSON.stringify(info));
			print("frontend-source-layout-contract " + mode + " OK");
		} finally {
			engine.cacheClear();
			LocalWorkDirectory.release();
			properties.setProperty(localProperty, previousLocal);
		}
	});
	print("frontend-source-layout-contract OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(temp);
}
