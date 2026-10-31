// The Java sources of a project (libs/src/**/*.java) are resources of the project: listed, read, searched, patched and
// deleted like the other ones, and created by a patch from an empty file. A source declares the package of its folder;
// other files of libs/src and other new resources stay refused.
var sourceRoot = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var File = java.io.File;
var temp = java.nio.file.Files.createTempDirectory("flow-java-sources-").toFile();
function assert(value, message) { if (!value) throw new Error(message); }
function read(file) { return String(FileUtils.readFileToString(file, "UTF-8")); }
function write(file, text) { FileUtils.writeStringToFile(file, String(text), "UTF-8"); }
function module(name) { return eval(read(new File(sourceRoot, "modules/" + name))); }
function raise(code, message, details, hint) { var error = new Error(message); error.code = code; error.details=details;error.hint=hint;throw error; }
function refused(code, fn) {
	try { fn(); } catch (e) { return e.code === code || String(e.message).indexOf(code) === 0; }
	return false;
}

var paths = module("source-layout.js").create("_flow");
var utils = module("resource-utils.js");
var patches = module("patch-utils.js");
var service = module("resource-service.js");
var project = new File(temp, "App");
var env = {
	sourcePaths: paths,
	File: File,
	Arrays: java.util.Arrays,
	FileUtils: FileUtils,
	raise: raise,
	projectDir: function () { return project; },
	canonicalPath: function (file) { return String(file.getCanonicalPath()); },
	normalizeResourcePath: function (path) { return utils.normalizePath(path, { raise: raise }); },
	isAllowedResourcePath: function (path) { return utils.isAllowedPath(path, paths); },
	resourceKind: function (path) { return utils.kind(path, paths); },
	resourceName: utils.name,
	resourceMimeType: utils.mimeType,
	resourceUri: function (path) { return utils.uri(path, paths); },
	firstMarkdownHeading: utils.firstMarkdownHeading,
	firstMarkdownParagraph: utils.firstMarkdownParagraph,
	globPatterns: utils.globPatterns,
	globMatches: utils.globMatches,
	intOption: function (value, fallback) { return value === undefined ? fallback : value; },
	sha256Hex: function (text) { return String(Packages.org.apache.commons.codec.digest.DigestUtils.sha256Hex(String(text))); },
	applyUnifiedPatchText: function (content, patch) { return patches.applyUnifiedPatchText(content, patch, { raise: raise }); },
	blockIdFromResourcePath: function (path) { return utils.blockIdFromPath(path, paths); },
	parseYamlSource: function (text, fallback) {
		var yaml = new Packages.com.fasterxml.jackson.databind.ObjectMapper(new Packages.com.fasterxml.jackson.dataformat.yaml.YAMLFactory());
		var json = new Packages.com.fasterxml.jackson.databind.ObjectMapper();
		return JSON.parse(String(json.writeValueAsString(yaml.readTree(String(text).trim() ? String(text) : fallback))));
	}
};

var target=new File(project,'_flow/engine.yaml');
var initial={version:1,config:{frontbuilder:{svelte:{modelPath:'model/App/src/routes/+page.flow.svelte'}}},configVisibility:{frontbuilder:'private'}};
write(target,JSON.stringify(initial));
env.applyRequestPatch=function(old,request){return {content:request.content,hunks:[],appliedHunks:0};};
var changed=service.patch({path:'_flow/engine.yaml',content:JSON.stringify({version:1,config:{}})},env);
assert(changed.warnings && changed.warnings[0].code==='PROJECT_CONFIG_KEYS_REMOVED' && changed.warnings[0].properties.indexOf('config.frontbuilder.svelte.modelPath')>=0 && changed.warnings[0].properties.indexOf('configVisibility')>=0,'removed bootstrap keys must be visible: '+JSON.stringify(changed));
var engineSource=read(new File(sourceRoot,'Engine.js'));
var start=engineSource.indexOf('function validateProjectResourceConfig('),end=engineSource.indexOf('\n\tfunction resourceServiceEnv(',start);
var validateConfig=eval('('+engineSource.substring(start,end).trim()+')');
function projectDir(){return project;}
function throwFlowError(options){var error=new Error(options.message);Object.keys(options).forEach(function(key){error[key]=options[key];});throw error;}
function sqlBlock(name){var text=read(new File(sourceRoot,'../../lib_flow_sql/_flow/blocks/sql/'+name+'.block.js'));return eval(text.substring(text.indexOf('(function')));}
function loadBlocks(){return {'sql.configCheck':sqlBlock('configCheck'),'sql.jdbcCommands':sqlBlock('jdbcCommands')};}
env.validateProjectConfig=validateConfig;
var broken={version:1,config:{sql:{connections:{app:{url:'jdbc:postgresql://localhost/db',nativeRead:true}},queries:{rows:{connection:'app',readOnly:true,maxRows:1000,sql:'SELECT ID AS "id" FROM ORDERS',parameters:[],columns:[{name:'id',type:'int64',nullable:false}]}}}}};
var before=read(target),failure=null;
try{service.patch({path:'_flow/engine.yaml',content:JSON.stringify(broken)},env);}catch(e){failure=e;}
assert(failure && failure.code==='SQL_CONFIG_INVALID' && failure.details.errors.length>=2,'SQL definition errors must be aggregated before writing: '+failure+' '+JSON.stringify(failure&&failure.details));
assert(read(target)===before,'invalid project configuration must not be written');
assert(failure.details.errors.some(function(e){return e.code==='SQL_QUERY_BOUNDS';}) && failure.details.errors.some(function(e){return e.code==='SQL_AUTH_REQUIRED';}),'all errors reported in one patch');
print('night-platform-config OK');

loadBlocks=function(){return {};};
var unavailable=service.patch({path:'_flow/engine.yaml',content:JSON.stringify(broken)},env);
assert(unavailable.validation.sql.checked===false && unavailable.warnings[0].code==='PROJECT_CONFIG_VALIDATOR_MISSING','Projects without the SQL library must explicitly report unchecked definitions rather than block config authoring');
print('missing-sql-validator-warning OK');
