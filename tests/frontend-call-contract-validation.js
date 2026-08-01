var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function loadService(name) {
	var file = new java.io.File(engineDir, "modules/" + name);
	return eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(file, "UTF-8")));
}

var requestableService = loadService("requestable-service.js");
var requestableVariables = new java.util.ArrayList();
requestableVariables.add({
	getName: function () { return "text"; },
	getSchemaType: function () { return "xsd:string"; },
	isMultiValued: function () { return false; },
	isRequired: function () { return true; },
	getDescription: function () { return "Search text"; }
});
requestableVariables.add({
	getName: function () { return "limit"; },
	getSchemaType: function () { return "xsd:integer"; },
	isMultiValued: function () { return false; },
	isRequired: function () { return false; },
	getDescription: function () { return ""; }
});
var requestableInputSchema = requestableService.inputSchemaForVariables(requestableVariables);
assertTrue(requestableInputSchema && requestableInputSchema.additionalProperties === false &&
	requestableInputSchema.properties.text.type === "string" &&
	requestableInputSchema.properties.limit.type === "integer" &&
	requestableInputSchema.required.length === 1 && requestableInputSchema.required[0] === "text",
	"Requestable variables did not produce a closed input contract schema");

var resolvedQNames = [];
var fakeCatalog = {
	getClass: function () {
		return { getName: function () { return "com.twinsoft.convertigo.beans.core.Sequence"; } };
	},
	getProject: function () {
		return { getName: function () { return "Marketplace"; } };
	},
	getVariables: function () {
		return [{
			getName: function () { return "text"; },
			getSchemaType: function () { return "xsd:string"; },
			isMultiValued: function () { return false; },
			isRequired: function () { return false; },
			getDescription: function () { return ""; }
		}];
	}
};
var relativeContract = requestableService.inputContract({ project: "Marketplace" }, ".Catalog", {
	currentProjectName: function (request) { return request.project; },
	requestableByQName: function (qname) {
		resolvedQNames.push(qname);
		return qname === "Marketplace.Catalog" ? fakeCatalog : null;
	}
});
assertTrue(relativeContract && relativeContract.target.project === "Marketplace" &&
	relativeContract.target.localRequestable === ".Catalog" && relativeContract.schema.properties.text &&
	resolvedQNames.length === 2 && resolvedQNames[0] === "Marketplace.Catalog" && resolvedQNames[1] === "Marketplace.Catalog",
	"Relative requestable input-contract targets did not resolve within the active project");

var flowTreeService = loadService("flow-tree-service.js");
function callContractDocument(variableName, contract, observedTargets) {
	return flowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
		'<FlowComponent id="smoke" label="Smoke">',
		'  <Structure><CallSequence id="catalog" requestable=".Catalog"><Variables><Variable name="' +
			variableName + '" value="books" /></Variables></CallSequence></Structure>',
		'</FlowComponent>'
	].join("\n"), {
		normalizeTree: function (value) { return value; },
		requestableInputContract: function (target) {
			observedTargets.push(target);
			return contract;
		}
	});
}

var validTargets = [];
var valid = callContractDocument("text", {
	schema: {
		type: "object",
		properties: { text: { type: "string" }, limit: { type: "integer" } },
		additionalProperties: false
	}
}, validTargets);
assertTrue(valid.diagnostics.length === 0 && validTargets.length === 1 && validTargets[0] === ".Catalog",
	"CallSequence validation rejected a valid relative target or omitted optional input");

var unknownTargets = [];
var unknown = callContractDocument("query", {
	schema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false }
}, unknownTargets);
assertTrue(unknown.diagnostics.length === 1 &&
	unknown.diagnostics[0].code === "FRONTEND_CALLSEQUENCE_VARIABLE_UNKNOWN" &&
	unknown.diagnostics[0].severity === "error" &&
	unknown.diagnostics[0].suggestedName === "text" &&
	unknown.diagnostics[0].fix.value === "text" &&
	unknown.diagnostics[0].nearestValidNames[0] === "text" &&
	String(unknown.diagnostics[0].next).indexOf('<Variable name="text">') !== -1,
	"CallSequence validation did not reject an unknown variable with a precise correction");

var unavailableTargets = [];
var unavailable = callContractDocument("query", null, unavailableTargets);
assertTrue(unavailable.diagnostics.length === 0 && unavailableTargets.length === 1,
	"CallSequence validation rejected a variable when the target schema was unavailable");

print(JSON.stringify({
	ok: true,
	cases: ["valid", "unknown", "unavailable-schema", "relative-target"]
}));
