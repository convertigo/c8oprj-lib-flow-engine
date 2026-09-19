// Exercise both layouts on temporary projects; never activate _flow in the checkout.
var sourceRoot = new java.io.File(arguments.length ? arguments[0] : "libs/flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var File = java.io.File;
var temp = java.nio.file.Files.createTempDirectory("flow-source-layout-").toFile();
var __flowEngineDir;
var __flowProjectDir;
var __flowSourceLayout;
var checks = 0;
function assert(value, label) { checks++; if (!value) throw new Error(label); }
function equal(actual, expected, label) { assert(JSON.stringify(actual) === JSON.stringify(expected), label + ": " + JSON.stringify(actual)); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
function write(file, text) { files.forceMkdir(file.getParentFile()); files.writeStringToFile(file, String(text), "UTF-8"); }
function module(name) { return eval(read(new File(sourceRoot, "modules/" + name))); }
var layouts = module("source-layout.js");
try {
	assert(layouts.current.root === "libs/flow", "Migration must not be globally active");
	assert(Object.isFrozen(layouts.current), "Layout is immutable shared metadata");
	var unknownRejected = false;
	try { layouts.create("_flows"); } catch (e) { unknownRejected = true; }
	assert(unknownRejected, "Unknown bootstrap layout must fail explicitly");
	["legacy", "_flow"].forEach(function (mode) {
		var paths = layouts.create(mode);
		var other = layouts.create(mode === "legacy" ? "_flow" : "legacy");
		var resources = module("resource-utils.js");
		["engine.yaml", "blocks/demo.block.js", "blocks/demo.hooks.js", "fragments/demo.fragment.yaml", "lib/demo.js", "resources/demo.md", "resources/property-editor.js", "frontbuilder/svelte/demo.flow.svelte", "types/text.type.yaml", "types/editors/text.html"].forEach(function (relative) {
			assert(resources.isAllowedPath(paths.path(relative), paths), "Resource allowlist missed " + relative);
			assert(!resources.isAllowedPath(other.path(relative), paths), "Resource allowlist accepts obsolete layout " + relative);
		});
		assert(resources.kind(paths.path("resources/property-editor.js"), paths) === "propertyEditorHost", "Editor host classification");
		assert(resources.blockIdFromPath(paths.path("blocks/demo/item.block.js"), paths) === "demo.item", "Block id depends on disk layout");
		["../escape", "a/../b", "/absolute", "C:/absolute", "a\\b", "a//b", "./a"].forEach(function (path) {
			var rejected = false; try { paths.path(path); } catch (e) { rejected = true; }
			assert(rejected, "Unsafe internal source path accepted: " + path);
		});
		var base = new File(temp, mode);
		var engineProject = new File(base, "lib_flow_engine");
		var engineRoot = new File(engineProject, paths.root);
		["modules", "blocks", "types", "resources"].forEach(function (path) {
			files.copyDirectory(new File(sourceRoot, path), new File(engineRoot, path));
		});
		["Engine.js", "engine.yaml"].forEach(function (path) {
			files.copyFile(new File(sourceRoot, path), new File(engineRoot, path));
		});
		// Same bootstrap-owned value as Java; no source rewriting or request option.
		__flowSourceLayout = mode;
		var project = new File(base, "LayoutProject");
		var ref = new File(base, "SharedLayout");
		write(new File(project, "c8oProject.yaml"), "↑LayoutProject [core.Project]:\n  projectName: SharedLayout\n");
		write(new File(ref, "c8oProject.yaml"), "↑SharedLayout [core.Project]:\n");
		write(new File(project, paths.path("engine.yaml")), "version: 1\nconfig:\n  greeting: migrated\n");
		write(new File(project, paths.path("lib/helper.js")), '(function(){return {tag:"helper-value"};}())');
		write(new File(ref, paths.path("blocks/proof/shared.block.js")),
			'const _meta={runtime:"rhino",properties:{id:{kind:"value",type:"number"},disabled:{kind:"value",type:"boolean"}},uses:["helper"]};\n' +
			'(function(){return {run:function(ctx,node){var input=ctx.template(ctx.props(node));return {id:input.id,disabled:input.disabled,greeting:ctx.scopes.config.greeting,tag:ctx.lib("helper").tag};}};}())');
		write(new File(project, paths.path("resources/guide/example.md")), "# Guide\n\nKept after relocation.\n");
		write(new File(project, "resources/public.json"), '{"public":true}');
		write(new File(engineProject, paths.flows + "/sample_layout.flow.js"), "function sample_layout(){return result}\n");
		// A stale tree must never be silently merged into the selected layout.
		write(new File(project, other.flows + "/Hidden.flow.js"), "function Hidden(){return result}\n");
		write(new File(project, other.path("engine.yaml")), "version: 1\nconfig:\n  greeting: WRONG\n");
		write(new File(ref, other.path("blocks/proof/hidden.block.js")), 'const _meta={runtime:"rhino"};\n(function(){return {run:function(){return "WRONG"}};}())');
		__flowEngineDir = String(engineRoot.getAbsolutePath());
		__flowProjectDir = String(project.getAbsolutePath());
		var engine = eval(read(new File(engineRoot, "Engine.js")));
		function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request || {}))); }
		var code = 'const _flow={sourceVersion:2};\nfunction LayoutProof(){\nproof.shared({$$id:"callShared",id:5,disabled:false,$$out:"result.value"})\n}';
		var created = api("flowCodeSet", {name:"LayoutProof",code:code,draft:true,sourceLayout:other.root,__flowSourceLayout:other.root});
		assert(created.ok, "Draft failed: " + JSON.stringify(created));
		assert(!new File(project, paths.flows + "/LayoutProof.flow.js").exists(), "Draft changed official source");
		var got = api("flowCodeGet", {name:"LayoutProof",draft:true});
		assert(got.ok && got.revision === created.revision, "Draft revision changed");
		var draftRun = api("flowCodeRun", {name:"LayoutProof",draft:true,includeTrace:false});
		assert(draftRun.ok, "Draft run failed: " + JSON.stringify(draftRun));
		equal(draftRun.result.value, {id:5,disabled:false,greeting:"migrated",tag:"helper-value"}, "Reference/config/library resolution");
		var promoted = api("flowCodePromote", {name:"LayoutProof",revision:got.revision});
		assert(promoted.ok, "Promote failed: " + JSON.stringify(promoted));
		var official = new File(project, paths.flows + "/LayoutProof.flow.js");
		assert(official.isFile(), "Save did not target active layout");
		assert(!new File(project, other.flows + "/LayoutProof.flow.js").exists(), "Save fell back to obsolete root");
		var saved = api("flowCodeGet", {name:"LayoutProof",draft:false});
		assert(saved.ok && saved.code === got.code, "Saved source lost dialect or values");
		equal(api("flowCodeRun", {name:"LayoutProof",draft:false,includeTrace:false}).result.value, draftRun.result.value, "Official runtime diverged from draft");
		var replacement = api("flowCodeSet", {name:"LayoutProof",code:code.replace("id:5", "id:6"),draft:true});
		assert(replacement.ok, "Second draft failed");
		var stalePromotion = api("flowCodePromote", {name:"LayoutProof",revision:got.revision});
		assert(!stalePromotion.ok && read(official) === saved.code, "Stale promotion overwrote official source");
		// Recreate the standalone Engine, which intentionally does not persist memory drafts.
		engine = eval(read(new File(engineRoot, "Engine.js")));
		assert(api("flowCodeGet", {name:"LayoutProof",draft:false}).code === saved.code, "Reload lost official source");
		assert(!api("flowCodeGet", {name:"Hidden",draft:false}).ok, "Read fell back to obsolete root");
		var resource = api("resourceGet", {uri:"flow://guide/example"});
		assert(resource.ok && resource.path === paths.path("resources/guide/example.md"), "Resource URI relocation: " + JSON.stringify(resource));
		var listed = api("resourceList", {hints:false,doc:false});
		assert(listed.ok && listed.resources.some(function (entry) {return entry.path === paths.path("resources/guide/example.md");}), "Resource default glob changed");
		assert(api("resourceGet", {path:"resources/public.json"}).ok, "Public resource access changed");
		assert(!api("resourceGet", {path:other.path("engine.yaml")}).ok, "Resource API accepts obsolete tree");
		assert(!api("resourceGet", {path:paths.root + "/../outside.json"}).ok, "Resource traversal accepted");
		var configMutation = api("authoringMutate", {target:"engine",includeTree:false,
			mutation:{op:"replace",__engineMutationPath:"config.greeting",value:"edited"}});
		assert(configMutation.ok && configMutation.path === paths.path("engine.yaml"), "Config mutation targeted wrong file: " + JSON.stringify(configMutation));
		engine.cacheClear();
		assert(api("flowCodeRun", {name:"LayoutProof",draft:false,includeTrace:false}).result.value.greeting === "edited", "Config mutation not reflected after reload");
		var patched = api("resourcePatch", {path:resource.path,baseHash:resource.hash,patch:"@@ -1,3 +1,3 @@\n # Guide\n \n-Kept after relocation.\n+Patched after relocation.\n"});
		assert(patched.ok && read(new File(project, resource.path)).indexOf("Patched after relocation.") !== -1, "Resource patch missed active root: " + JSON.stringify(patched));
		var stalePatch = api("resourcePatch", {path:resource.path,baseHash:resource.hash,patch:"@@ -1 +1 @@\n-# Guide\n+# Stale\n"});
		assert(!stalePatch.ok && stalePatch.error.code === "RESOURCE_BASE_HASH_MISMATCH", "Stale patch was accepted");
		var createdBlock = api("blockCodeSet", {name:"local.identity",code:'const _meta={sourceVersion:2,runtime:"flow"};\nfunction Identity(){return input}\n'});
		assert(createdBlock.ok && new File(project, paths.path("blocks/local/identity.block.js")).isFile(), "Block writer missed active root");
		var block = api("blockCodeGet", {name:"local.identity"});
		assert(block.ok, "Block reload failed");
		var blockEdit = api("applySourceMutation", {sourceFile:String(new File(project, paths.path("blocks/local/identity.block.js")).getAbsolutePath()),
			source:block.code,mutation:{op:"replace",path:"flow.description",value:"Edited"}});
		assert(blockEdit.ok && blockEdit.name === "local.identity", "Block mutation lost its namespace after relocation: " + JSON.stringify(blockEdit));
		var catalog = api("catalog", {detail:"full"});
		assert(catalog.ok && JSON.stringify(catalog).indexOf('proof.shared') !== -1, "Reference missing from catalog");
		assert(JSON.stringify(catalog).indexOf('proof.hidden') === -1, "Catalog merged stale root");
		var libraries = module("flow-library-service.js");
		var libEnv = {File:File,sourcePaths:paths,projectNameForRoot:function(root){return String(root.getName());}};
		assert(libraries.providerName(new File(project, paths.root), "bad", libEnv) === "LayoutProject", "Provider identity depends on path depth");
		assert(String(libraries.projectRootFromFlowDir(engineRoot, libEnv)) === String(engineProject), "Engine project root misidentified");
		var frontend = module("frontend-catalog-service.js");
		var visitedFrontendPaths = [];
		var frontendEnv = {
			File:File,sourcePaths:paths,projectDir:function(){return project;},
			projectNameForRoot:libEnv.projectNameForRoot,
			resourceRelativePath:function(root,file){return String(root.toPath().relativize(file.toPath())).replace(/\\/g,"/");},
			canonicalPath:function(file){return String(file.getCanonicalPath());},
			referencedProjectRoots:function(relative){
				assert(relative === paths.path("frontbuilder/svelte"), "Frontend reference searches inactive root");
				return [ref];
			},
			directoryFingerprint:function(file){visitedFrontendPaths.push(String(file.getCanonicalPath()));return String(file.getCanonicalPath());}
		};
		var bootstrap = frontend.frontendCreateDescriptorsForConfig({}, frontendEnv)[0];
		assert(bootstrap.insert.resourceRoot === paths.path("frontbuilder/svelte"), "Frontend bootstrap resource root");
		assert(bootstrap.insert.modelPath === paths.path("frontbuilder/svelte/model/SvelteFrontend/src/routes/+page.flow.svelte"), "Frontend bootstrap model path");
		var frontendSettings = {target:"svelte5",modelPath:paths.path("frontbuilder/svelte/model/LayoutProject/src/routes/+page.flow.svelte")};
		var descriptors = frontend.frontendCreateDescriptorsForSettings("svelte", frontendSettings, frontendEnv);
		function descriptor(id){return descriptors.filter(function(item){return item.id === "frontbuilder.svelte." + id;})[0].insert.__frontendCreateSource;}
		assert(descriptor("page").fallbackDirectory === "model/LayoutProject/src/routes", "Page directory doubled its source prefix");
		assert(descriptor("layout").fallbackDirectory === "model/LayoutProject/src/routes", "Layout directory doubled its source prefix");
		assert(descriptor("flowUiBlock").directory === "model/LayoutProject/src/lib/components/${namespacePath}", "Component directory uses wrong root");
		assert(descriptor("svelteClientAction").directory === "model/LayoutProject/src/lib/actions/${namespacePath}", "Action directory uses wrong root");
		assert(descriptor("translation.fr").directory === "model/LayoutProject/src/i18n", "Translation directory uses wrong root");
		[project,ref].forEach(function(root){
			write(new File(root, paths.path("frontbuilder/svelte/components/Visible.svelte")), "<p>Visible</p>");
			write(new File(root, other.path("frontbuilder/svelte/components/Hidden.svelte")), "<p>Hidden</p>");
		});
		frontend.fingerprintForConfig({frontbuilder:{svelte:frontendSettings}}, frontendEnv);
		assert(visitedFrontendPaths.length === 2, "Frontend fingerprint merged extra roots: " + visitedFrontendPaths);
		assert(visitedFrontendPaths.indexOf(String(new File(project, paths.path("frontbuilder/svelte/components")).getCanonicalPath())) !== -1, "Frontend project components missing from invalidation");
		assert(visitedFrontendPaths.indexOf(String(new File(ref, paths.path("frontbuilder/svelte/components")).getCanonicalPath())) !== -1, "Frontend reference components missing from invalidation");
		var refMetadata = frontend.sourceMetadataForFile(new File(ref, paths.path("frontbuilder/svelte/components/Visible.svelte")), "svelte", frontendEnv, "bad");
		assert(refMetadata.provider === "SharedLayout" && refMetadata.sourceOrigin === "library" && !refMetadata.sourceWritable, "Referenced component provider/write protection changed");
		assert(refMetadata.sourceRelativePath === paths.path("frontbuilder/svelte/components/Visible.svelte"), "Referenced component path not relative to its provider");
		var ownMetadata = frontend.sourceMetadataForFile(new File(project, paths.path("frontbuilder/svelte/components/Visible.svelte")), "svelte", frontendEnv, "bad");
		assert(ownMetadata.provider === "LayoutProject" && ownMetadata.sourceOrigin === "project" && ownMetadata.sourceWritable, "Local component provider/write protection changed");
		var entries = api("search", {query:"sample_layout",kind:"sample",includeLibrarySamples:true});
		assert(entries.ok && JSON.stringify(entries).indexOf("sample_layout.flow.js") !== -1, "Core sample lookup missed active flow root: " + JSON.stringify(entries));
		print("source-layout-contract " + mode + " OK");
	});
	print("source-layout-contract OK (" + checks + " checks)");
} finally {
	// Only this test's Files.createTempDirectory, never an authored project.
	files.deleteDirectory(temp);
}
