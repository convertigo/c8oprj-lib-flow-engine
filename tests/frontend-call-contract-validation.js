var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());

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
		'<script module>export const _flow = { sourceVersion: 2 };</script><FlowComponent $$id="smoke" label="Smoke">',
		'  <Structure><CallSequence $$id="catalog" requestable=".Catalog"><Variables><Variable name="' +
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

// A Private target: the frontend cannot call it outside the Studio. Its contract carries its accessibility, also for a
// requestable without variables, a classic sequence or a Flow of a referenced project.
function fakeRequestable(className, project, accessibility, authenticated, variables) {
	return {
		getClass: function () { return { getName: function () { return className; } }; },
		getProject: function () { return { getName: function () { return project; } }; },
		getAccessibility: function () { return { toString: function () { return accessibility; } }; },
		getAuthenticatedContextRequired: function () { return authenticated; },
		getVariables: variables === undefined ? undefined : function () { return variables; }
	};
}
var catalogue = {
	"Marketplace.CurrentUser": fakeRequestable("com.twinsoft.convertigo.beans.flow.Flow", "Marketplace", "Private", false, []),
	"Marketplace.Legacy": fakeRequestable("com.twinsoft.convertigo.beans.core.Sequence", "Marketplace", "Private", true),
	"lib_Users.Me": fakeRequestable("com.twinsoft.convertigo.beans.flow.Flow", "lib_Users", "Hidden", true, [])
};
var lookup = {
	currentProjectName: function (request) { return request.project; },
	requestableByQName: function (qname) { return catalogue[qname] || null; }
};
var privateContract = requestableService.inputContract({ project: "Marketplace" }, ".CurrentUser", lookup);
assertTrue(privateContract && privateContract.accessibility === "Private" && privateContract.authenticatedContextRequired === false &&
	privateContract.schema && Object.keys(privateContract.schema.properties).length === 0,
	"The contract of a Flow without variables carries its accessibility: " + JSON.stringify(privateContract));
var legacyContract = requestableService.inputContract({ project: "Marketplace" }, ".Legacy", lookup);
assertTrue(legacyContract && legacyContract.accessibility === "Private" && legacyContract.authenticatedContextRequired === true &&
	legacyContract.schema === null && legacyContract.target.kind === "sequence",
	"A classic sequence without a variable list still has a contract: " + JSON.stringify(legacyContract));
var referencedContract = requestableService.inputContract({ project: "Marketplace" }, "lib_Users.Me", lookup);
assertTrue(referencedContract && referencedContract.accessibility === "Hidden" && referencedContract.target.project === "lib_Users",
	"A Flow of a referenced project: " + JSON.stringify(referencedContract));

function callDocument(requestable, contract) {
	return flowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
		'<script module>export const _flow = { sourceVersion: 2 };</script><FlowComponent $$id="smoke" label="Smoke">',
		'  <Structure><CallSequence $$id="me" requestable="' + requestable + '"></CallSequence></Structure>',
		'</FlowComponent>'
	].join("\n"), {
		normalizeTree: function (value) { return value; },
		requestableInputContract: function () { return contract; }
	});
}
var privateCall = callDocument(".CurrentUser", privateContract).diagnostics.filter(function (item) { return item.code === "FRONTEND_CALLSEQUENCE_PRIVATE"; });
assertTrue(privateCall.length === 1 && privateCall[0].severity === "error" && /\.props\.requestable$/.test(privateCall[0].path) &&
	/Marketplace\.CurrentUser, which is Private/.test(privateCall[0].message) &&
	privateCall[0].next.indexOf("A Flow called by the frontend must be Hidden (with authenticatedContextRequired when it needs a logged-in user)") === 0 &&
	/_flow\.accessibility to "hidden"/.test(privateCall[0].next) && /_flow\.authenticatedContextRequired to true/.test(privateCall[0].next),
	"CallSequence to a Private Flow is an error with the advice: " + JSON.stringify(privateCall));
var legacyCall = callDocument(".Legacy", legacyContract).diagnostics.filter(function (item) { return item.code === "FRONTEND_CALLSEQUENCE_PRIVATE"; });
assertTrue(legacyCall.length === 1 && /accessibility property of Marketplace\.Legacy to Hidden\.$/.test(legacyCall[0].next),
	"a classic sequence is told to change its accessibility property: " + JSON.stringify(legacyCall));
assertTrue(callDocument("lib_Users.Me", referencedContract).diagnostics.length === 0, "a Hidden target is callable");

print(JSON.stringify({
	ok: true,
	cases: ["valid", "unknown", "unavailable-schema", "relative-target", "private-flow", "private-sequence", "hidden-referenced"]
}));
