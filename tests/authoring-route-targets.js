// Real Rhino + Node provider, no source publication outside the temporary fixture.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var files = Packages.org.apache.commons.io.FileUtils;
var sandbox = java.nio.file.Files.createTempDirectory("flow-source-create-");
var original = java.nio.file.Files.createDirectory(sandbox.resolve("project"));
var root = java.nio.file.Files.createSymbolicLink(sandbox.resolve("linked-project"), original).toFile();
var __flowProjectDir = String(root);
var resourceRoot = String(new java.io.File(arguments[1] || java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT")).getCanonicalPath());
var page = new java.io.File(root, "_flow/frontbuilder/svelte/model/Proof/src/routes/+page.flow.svelte");
page.getParentFile().mkdirs();
files.writeStringToFile(page, '<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="home"><Structure /></FlowComponent>\n', "UTF-8");
var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " + resourceRoot + "\n      modelPath: " + page + "\n";
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var drafts = {};
function assert(value, message) { if (!value) throw new Error(message); }
function request() { return { target: "engine", engineSource: engineSource, projectDir: __flowProjectDir,
	frontendSourceDrafts: drafts, surface: "frontend", builder: "svelte", includeFrontendCatalog: false,
	includeFlowCatalog: false, includeBindings: false, includeTree: false }; }
function call(method, options) {
	var response = JSON.parse(engine[method](JSON.stringify(Object.assign(request(), options || {}))));
	assert(response.ok !== false, method + ": " + JSON.stringify(response));
	return response;
}
function find(node, predicate) {
	if (predicate(node)) return node;
	for (var i = 0; i < (node.children || []).length; i++) {
		var found = find(node.children[i], predicate); if (found) return found;
	}
}
function sourcePath(node) { return JSON.parse(node.info || "{}").sourcePath || ""; }
function tree() {
	var result = call("describeTree");
	var error = find(result, function (node) { return node.kind === "error"; });
	assert(!error, "No source projection error: " + JSON.stringify(error));
	return result;
}
function result(method, options) {return JSON.parse(engine[method](JSON.stringify(Object.assign(request(), options || {}))));}
[{}, {mutation:{op:'insert',path:'frontends.svelte.routes'}}, {mutations:[{op:'insert',path:'frontends.svelte.routes'}]}, {action:{}}].forEach(function(args){
 var out=result('authoringMutate',args);assert(!out.ok && /^AUTHORING_/.test(out.error.code) && /items\[\]\.apply\.arguments/.test(out.error.hint),'bad command gets shape/target error: '+JSON.stringify(out));
});
var routes=find(tree(),function(node){return node.kind==='frontendRoutes';});
var palette=call('authoringPalette',{focusPath:routes.path,detail:'normal'});
assert(!palette.items.some(function(item){return item.id==='frontbuilder.svelte.page';}),'root already has a page: never offer an impossible Page apply');
assert(palette.items.some(function(item){return item.id==='frontbuilder.svelte.layout';}),'the unoccupied Layout remains available');
var builderPalette=call('authoringPalette',{focusPath:routes.path.replace(/\.routes$/,''),detail:'normal'});
assert(!builderPalette.items.some(function(item){return item.id==='frontbuilder.svelte.page';}),'the builder uses its routes directory for occupied recipes');
var collision=result('authoringMutate',{action:{id:'frontbuilder.svelte.page',targetPath:routes.path,name:'ignored'}});
assert(!collision.ok && collision.error.code==='SOURCE_ALREADY_EXISTS' && /route segment/i.test(collision.error.hint),'forced creation names the occupied source and the route-segment fix');
var segment=call('authoringMutate',{action:{id:'frontbuilder.svelte.routeSegment',surface:'frontend',builder:'svelte',targetPath:routes.path,name:'products'}});
Object.keys(segment.sourceChanges).forEach(function(path){drafts[path]=segment.sourceChanges[path];});
assert(/route_products$/.test(segment.path) && segment.parentPath===segment.path,'new segment reports the actual palette target: '+JSON.stringify(segment));
var bad=result('authoringMutate',{action:{id:'frontbuilder.svelte.page',targetPath:routes.path+'.products'}});
assert(!bad.ok && bad.error.code==='INVALID_AUTHORING_ACTION_TARGET' && /Unknown authoring target/.test(bad.error.message) && bad.error.details.validPaths.indexOf(segment.path)>=0 && /items\[\]\.apply/.test(bad.error.hint),'unknown target gives valid neighboring paths: '+JSON.stringify(bad));
var created=call('authoringMutate',{action:{id:'frontbuilder.svelte.page',targetPath:segment.selectionSourcePath,name:'ignored'}});
assert(created.argumentWarning && /Ignored action.name/.test(created.argumentWarning) && created.path,'source path selects the actual folder and ignored name is reported');
Object.keys(created.sourceChanges).forEach(function(path){drafts[path]=created.sourceChanges[path];});
call('authoringPalette',{focusPath:created.path,detail:'normal'}); // A Page source is a file, not a recipe destination directory.
var occupied=call('authoringPalette',{focusPath:segment.selectionSourcePath,detail:'normal'});
assert(!occupied.items.some(function(item){return item.id==='frontbuilder.svelte.page';}),'draft Page occupies its route too');
var legacySegment=call('authoringMutate',{action:{id:'frontbuilder.svelte.routeSegment',targetPath:routes.path,name:'legacy'}});
Object.keys(legacySegment.sourceChanges).forEach(function(path){drafts[path]=legacySegment.sourceChanges[path];});
var legacy=new java.io.File(root,'_flow/frontbuilder/svelte/model/Proof/src/routes/legacy/+page.svelte');legacy.getParentFile().mkdirs();files.writeStringToFile(legacy,'<p>Legacy</p>','UTF-8');
var legacyPalette=call('authoringPalette',{focusPath:'frontends.svelte.routes.route_legacy',detail:'normal'});
assert(!legacyPalette.items.some(function(item){return item.id==='frontbuilder.svelte.page';}),'a legacy page excludes a colliding Flow Page');
print('authoring-route-targets OK (shape errors, occupied saved/draft/legacy routes, created path, source target and neighboring paths)');
