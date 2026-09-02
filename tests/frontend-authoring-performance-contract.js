var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function functionSource(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assertTrue(start >= 0 && end > start, name + " must remain extractable");
	return source.substring(start, end);
}

var documentSource = functionSource("describeFrontendDocument", "prewarmFrontendDocumentServer");
assertTrue(documentSource.indexOf('frontendPerformanceMark("frontend.document.fingerprint")') <
	documentSource.indexOf('frontendPerformanceMark("frontend.document.memoryCache")'),
	"frontend document profiling must separate fingerprint validation from the memory cache lookup");
assertTrue(documentSource.indexOf('frontendPerformanceMark("frontend.document.providerPrepare")') <
	documentSource.indexOf('frontendPerformanceMark("frontend.document.provider")'),
	"frontend document profiling must separate provider preparation from provider execution");
assertTrue(documentSource.indexOf('frontendPerformanceMark("frontend.document.postInstallFingerprint")') >
	documentSource.indexOf('frontendPerformanceMark("frontend.document.provider")'),
	"a provider installation must expose its post-install fingerprint validation separately");

var catalogSource = functionSource("frontendBlocksForSettings", "frontendCreateDescriptorsForSettings");
assertTrue(catalogSource.indexOf('frontendPerformanceMark("frontend.catalog.blocks")') >= 0,
	"frontend catalog construction must expose a performance phase");

var durationSource = functionSource("frontendPerformanceDuration", "frontendRunStep");
assertTrue(durationSource.indexOf("performanceProfileAdd") >= 0,
	"nested frontend profiling must preserve the coarse sequential phase cursor");
var treeServiceSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8"));
assertTrue(treeServiceSource.indexOf('measureFrontendAuthoring("propertyDefinitions"') >= 0
	&& treeServiceSource.indexOf('measureFrontendAuthoring("serialize"') >= 0,
	"frontend authoring projection must expose definition and serialization costs");
assertTrue(treeServiceSource.indexOf('Object.defineProperty(definitions, "__flowCompactJson"') >= 0
	&& treeServiceSource.indexOf('key === "propertyDefinitions"') >= 0,
	"repeated authoring property contracts must reuse their compact representation");

var candidateSource = functionSource("seedAuthoringTreeCandidate", "cachedAuthoringTreeBase");
assertTrue(candidateSource.indexOf("authoringTreeBaseFromEngineTree") >= 0,
	"engine describeTree must retain a bounded authoring base candidate");
var bridgeCandidateSource = functionSource("bridgeAuthoringTreeCandidate", "cachedAuthoringTreeBase");
assertTrue(bridgeCandidateSource.indexOf("__flowBridgeDescribeTreeSnapshot") >= 0,
	"authoring runtimes must accept the opaque describeTree snapshot shared by the bridge");
assertTrue(bridgeCandidateSource.indexOf("__flowAuthoringSnapshotFingerprints") >= 0
	&& bridgeCandidateSource.indexOf("fingerprints[builder]") >= 0,
	"a bridge snapshot must be rejected when its source fingerprint is stale");
var candidateValidationSource = functionSource("validAuthoringTreeCandidate", "cachedAuthoringTreeBase");
assertTrue(candidateValidationSource.indexOf('candidate.ok !== true') >= 0
	&& candidateValidationSource.indexOf('children.length === 1') >= 0,
	"a malformed shared candidate must be rejected before reuse");
var baseSource = functionSource("cachedAuthoringTreeBase", "authoringTreeRequest");
assertTrue(baseSource.indexOf('"frontend.base.sharedCandidateUsed"') >= 0,
	"cold authoring must expose reuse of a validated shared candidate");
assertTrue(baseSource.indexOf("if (validCandidate)") < baseSource.indexOf("authoringTreeBaseRequest(baseRequest"),
	"a valid shared candidate must bypass the duplicate authoring tree build");
assertTrue(baseSource.indexOf('"frontend.base.sharedCandidateRejected"') >= 0,
	"invalid shared candidates must expose their fallback before regeneration");

print("frontend-authoring-performance-contract OK");
