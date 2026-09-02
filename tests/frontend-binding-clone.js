var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
var serviceFile = new java.io.File(engineDir, "modules/frontend-catalog-service.js");
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

var cloneCalls = 0;
var original = {
	tree: {
		sourceMutationPath: "frontAst.target",
		propertyDefinitions: {
			text: {
				bindingSources: [{ id: "load", source: { category: "action", actionId: "load" } }]
			}
		},
		children: [{
			sourceMutationPath: "frontAst.other",
			propertyDefinitions: {
				text: {
					bindingSources: [{ id: "load", source: { category: "action", actionId: "load" } }]
				}
			}
		}]
	}
};
var enriched = service.enrichBindingSources(original, {
	load: { type: "object", properties: { name: { type: "string" } } }
}, {
	normalizeTree: function (value) { return value; },
	cloneTree: function (value) {
		cloneCalls++;
		return JSON.parse(JSON.stringify(value));
	},
	schemaLeafEntries: function () { return [{ path: "name", type: "string" }]; },
	schemaArrayPaths: function () { return []; },
	schemaPaths: function () { return ["name"]; },
	schemaSimpleType: function () { return "string"; },
	schemaAtPath: function () { return { type: "string" }; }
}, { property: "text", bindingTargetPath: "frontAst.target" });

assertTrue(cloneCalls === 1, "Binding enrichment did not use the supplied JSON clone");
assertTrue(original.tree.propertyDefinitions.text.bindingSources[0].paths === undefined,
	"Binding enrichment mutated the cached source document");
assertTrue(enriched.tree.propertyDefinitions.text.bindingSources[0].paths[0].path === "name",
	"Binding enrichment did not preserve the enriched response");
assertTrue(enriched.tree.children[0].propertyDefinitions.text.bindingSources[0].paths === undefined,
	"Targeted binding enrichment processed an unrelated frontend node");

print("frontend-binding-clone OK");
