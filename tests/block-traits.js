// Traits bring shared properties to backend blocks (spec-flow-catalog-composition-v1).
var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-block-traits-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value, message) { if (!value) throw new Error(message); }
function invoke(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	Packages.org.apache.commons.io.FileUtils.writeStringToFile(file, text, "UTF-8");
}

write("_flow/traits/proof/greeting.trait.js", 'const _meta = {\n  "sourceVersion": 2,\n  "name": "proof.greeting",\n'
	+ '  "properties": {\n    "salutation": { "label": "Salutation", "kind": "text", "type": "string", "default": "Hello",'
	+ ' "description": "Word that opens the greeting.", "note": "Keep it short." }\n  }\n};\n');
assert(invoke("blockCodeSet", { name: "proof.greet", code: 'const _meta={sourceVersion:2,runtime:"rhino",'
	+ 'traits:{"proof.greeting":{salutation:{default:"Bonjour",note:"French by default here."}}},'
	+ 'properties:{name:{kind:"text",type:"string",description:"Who to greet."}}};\n'
	+ '(function(){return {run:function(ctx,node){var p=ctx.props(node);return p.salutation+" "+p.name;}};}())' }).ok, "Create block composing a trait");

var block = invoke("blockGet", { name: "proof.greet" });
var descriptor = block.block || block;
var props = descriptor.properties || descriptor.props || {};
var salutation = props.salutation;
assert(salutation, "The trait brings its property: " + JSON.stringify(descriptor));
assert(salutation.trait === "proof.greeting" && salutation["default"] === "Bonjour", "The block changes the default: " + JSON.stringify(salutation));
assert(salutation.description === "Word that opens the greeting. Keep it short. French by default here.", "Documentation composed, not rewritten: " + salutation.description);
assert(descriptor.traits.indexOf("proof.greeting") >= 0, "Trait listed: " + JSON.stringify(descriptor.traits));
assert(props.name && props.name.description === "Who to greet.", "Own properties stay");

var run = invoke("run", { definition: { flow: { sourceVersion: 2 }, nodes: [{ block: "proof.greet", props: { name: "Nicolas" }, out: "result.text" }] }, includeTrace: false });
assert(run.ok && run.result.text === "Bonjour Nicolas", "The composed default applies at run time: " + JSON.stringify(run));
// A core trait: the blocks working on a project share projectDir, documented once.
var core = invoke("blockGet", { name: "type.get" });
var coreProps = (core.block || core).properties || (core.block || core).props || {};
assert(coreProps.projectDir && coreProps.projectDir.trait === "flow.projectScoped", "Core block composes flow.projectScoped: " + JSON.stringify(coreProps.projectDir));
print("block-traits OK: project trait, composed documentation, changed default, runtime default, core trait");
