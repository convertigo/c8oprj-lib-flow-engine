var engineDir = arguments.length > 0 ? arguments[0] : "libs/flow";
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = String(new java.io.File(engineDir).getAbsolutePath());
var projectDirFile = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-smoke-project");
if (projectDirFile.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectDirFile);
}
projectDirFile.mkdirs();
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var flowSource = [
	"version: 1",
	"nodes:",
	"  - id: initItems",
	"    block: set",
	"    path: flow.items",
	"    value:",
	"      - Paris",
	"      - Lyon",
	"  - id: initResult",
	"    block: set",
	"    path: result.cities",
	"    value: []",
	"  - id: loopItems",
	"    block: forEach",
	"    items: flow.items",
	"    nodes:",
		"      - id: pushCurrent",
		"        block: json.push",
		"        path: result.cities",
		"        value: \"{{ current }}\"",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: Hello Flow",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result }}\"",
	""
].join("\n");

var catalog = JSON.parse(engine.catalog("{}"));
print(JSON.stringify(catalog));
assertTrue(catalog.blocks.some(function (block) {
	return block.name === "requestable.call";
}), "catalog did not expose requestable.call");
print(engine.analyze(JSON.stringify({ flowSource: flowSource })));
var describedFlowTree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", flowSource: flowSource })));
print(JSON.stringify(describedFlowTree));
assertTrue(describedFlowTree.children[0].name === "flow" &&
	describedFlowTree.children[0].children[2].type === "forEach",
	"describeTree(flow) did not expose flow nodes");
assertTrue(describedFlowTree.children[0].children[0].summary === "[set] flow.items = [\"Paris\",\"Lyon\"]",
	"describeTree(flow) did not expose data-centric display names");
var mutatedFlow = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "flow",
	flowSource: flowSource,
	mutation: {
		op: "insert",
		path: "/nodes",
		index: 4,
		value: {
			id: "setMutationFlag",
			block: "set",
			path: "result.mutated",
			value: true
		}
	}
})));
print(JSON.stringify(mutatedFlow));
assertTrue(mutatedFlow.ok === true && mutatedFlow.analysis.writes.indexOf("result.mutated") !== -1,
	"applyMutation(flow) did not append and analyze a node");
var mutatedFlowRun = JSON.parse(engine.run(JSON.stringify({ flowSource: mutatedFlow.source })));
assertTrue(mutatedFlowRun.result.mutated === true, "Mutated flow source did not execute");
print(engine.run(JSON.stringify({ flowSource: flowSource })));
var staticSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceItems",
	"    block: set",
	"    path: flow.items",
	"    value:",
	"      - city: Paris",
	"        temperature: 36",
	"  - id: copyItems",
	"    block: set",
	"    path: result.items",
	"    value: \"{{ flow.items }}\"",
	""
].join("\n");
var staticOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: staticSchemaFlowSource })));
assertTrue(staticOutputSchema.schema.properties.items.type === "array" &&
	staticOutputSchema.schema.properties.items.items.properties.city.type === "string" &&
	staticOutputSchema.schema.properties.items.items.properties.temperature.type === "integer",
	"outputSchema did not derive result from static dataflow analysis");
var explicitReturnSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceItems",
	"    block: set",
	"    path: flow.items",
	"    value:",
	"      - city: Paris",
	"        temperature: 36",
	"  - id: done",
	"    block: return",
	"    value: \"{{ flow.items }}\"",
	""
].join("\n");
var explicitReturnSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: explicitReturnSchemaFlowSource })));
assertTrue(explicitReturnSchema.schema.type === "array" &&
	explicitReturnSchema.schema.items.properties.city.type === "string",
	"outputSchema did not derive explicit return schema from static dataflow analysis");
var learnedRun = JSON.parse(engine.run(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource })));
var learnedSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource })));
assertTrue(learnedRun.result.message === "Hello Flow", "Named flow did not execute for schema learning");
assertTrue(learnedSchema.schema.properties.cities.type === "array" &&
	learnedSchema.schema.properties.message.type === "string",
	"outputSchema did not expose the learned Flow result structure");

var implicitReturnFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: implicit result",
	""
].join("\n");
var implicitReturnRun = JSON.parse(engine.run(JSON.stringify({ flowSource: implicitReturnFlowSource })));
print(JSON.stringify(implicitReturnRun));
assertTrue(implicitReturnRun.result.message === "implicit result", "Flow did not return result implicitly");

var templatedValueFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: \"Hello {{ input.append }}\"",
	""
].join("\n");
var templatedValueRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: templatedValueFlowSource,
	input: {
		append: "Flow"
	}
})));
print(JSON.stringify(templatedValueRun));
assertTrue(templatedValueRun.result.message === "Hello Flow", "Flow did not template string literal values");

var explicitReturnFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: before",
	"    block: set",
	"    path: result.message",
	"    value: before return",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result }}\"",
	"  - id: after",
	"    block: set",
	"    path: result.message",
	"    value: after return",
	""
].join("\n");
var explicitReturnRun = JSON.parse(engine.run(JSON.stringify({ flowSource: explicitReturnFlowSource })));
print(JSON.stringify(explicitReturnRun));
assertTrue(explicitReturnRun.result.message === "before return", "Flow did not stop after return");

var throwFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fail",
	"    block: throw",
	"    code: WEATHER_ALERT_ERROR",
	"    status: 422",
	"    message: Weather alert failed",
	"    details:",
	"      reason: threshold missing",
	""
].join("\n");
var throwRun = JSON.parse(engine.run(JSON.stringify({ flowSource: throwFlowSource })));
print(JSON.stringify(throwRun));
assertTrue(throwRun.ok === false && throwRun.error.code === "WEATHER_ALERT_ERROR",
	"Flow throw did not produce a structured error");

var fixtureUrl = new java.io.File(new java.io.File(engineDir).getParentFile().getParentFile(), "fixtures/weather-alert.json").toURI().toURL().toString();
var weatherUrl = new java.lang.String(fixtureUrl);
var apiKey = new java.lang.String("demo-key");
var threshold = new java.lang.String("35");
var weatherFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fetchWeather",
	"    block: http.get",
	"    url: \"{{ config.weatherUrl }}\"",
	"    headers:",
	"      X-Api-Key: \"{{ config.apiKey }}\"",
	"    out: flow.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: flow.weather",
	"    path: body.metropoles",
	"    out: flow.metropoles",
	"  - id: initHotCities",
	"    block: set",
	"    path: result.hotCities",
	"    value: []",
	"  - id: eachCity",
	"    block: forEach",
	"    items: flow.metropoles",
	"    nodes:",
	"      - id: keepHotCity",
	"        block: if",
	"        condition: current.temperature >= config.threshold",
	"        then:",
	"          - id: pushHotCity",
	"            block: json.push",
	"            path: result.hotCities",
	"            value: \"{{ current.city }}\"",
	"  - id: notify",
	"    block: email.mock",
	"    to: ops@example.com",
	"    subject: Weather alert",
	"    body: \"Hot cities over {{ config.threshold }}C: {{ result.hotCities }}\"",
	"    out: result.notification",
	"  - id: message",
	"    block: set",
	"    path: result.message",
	"    value: Weather alert computed",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result }}\"",
	""
].join("\n");
print(engine.analyze(JSON.stringify({ flowSource: weatherFlowSource })));
var notifyContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "notify",
	property: "body",
	include: ["flow", "result"],
	detail: "normal"
})));
print(JSON.stringify(notifyContext));
assertTrue(notifyContext.ok === true &&
	notifyContext.scopes.flow.paths.some(function (entry) { return entry.path === "flow.metropoles"; }) &&
	notifyContext.scopes.result.paths.some(function (entry) { return entry.path === "result.hotCities"; }) &&
	!notifyContext.scopes.result.paths.some(function (entry) { return entry.path === "result.message"; }),
	"Flow context did not expose only paths available before notify");

var keepHotCityContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "keepHotCity",
	property: "condition",
	include: ["current"],
	detail: "normal"
})));
print(JSON.stringify(keepHotCityContext));
assertTrue(keepHotCityContext.ok === true &&
	keepHotCityContext.scopes.current.paths.length === 1 &&
	keepHotCityContext.scopes.current.paths[0].producer &&
	keepHotCityContext.scopes.current.paths[0].producer.path === "flow.metropoles",
	"Flow context did not expose current source inside forEach");

var compactContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "notify",
	include: ["flow"],
	detail: "compact"
})));
print(JSON.stringify(compactContext));
assertTrue(Object.keys(compactContext.scopes).join(",") === "flow" &&
	compactContext.scopes.flow.indexOf("flow.weather") !== -1,
	"Flow compact context did not filter scopes");
print(engine.run(JSON.stringify({ flowSource: weatherFlowSource })));
print(engine.run(JSON.stringify({
	flowSource: weatherFlowSource,
	config: {
		weatherUrl: fixtureUrl,
		apiKey: "demo-key",
		threshold: 35
	}
})));
var schemaFlowName = "WeatherSchemaLearn";
var schemaFile = new java.io.File(projectDirFile, "libs/flow/schemas/" + schemaFlowName + "/fetchWeather.out.schema.json");
assertTrue(!schemaFile.isFile(), "Learned schema should not exist before the first named run");
var schemaLearnRun = JSON.parse(engine.run(JSON.stringify({
	flowName: schemaFlowName,
	flowSource: weatherFlowSource,
	config: {
		weatherUrl: fixtureUrl,
		apiKey: "demo-key",
		threshold: 35
	},
	includeTrace: false
})));
assertTrue(schemaLearnRun.ok === true && schemaFile.isFile(),
	"HTTP block did not learn its output schema when the schema file was missing");
var learnedContext = JSON.parse(engine.context(JSON.stringify({
	flowName: schemaFlowName,
	flowSource: weatherFlowSource,
	node: "selectMetropoles",
	include: ["flow"],
	detail: "compact"
})));
print(JSON.stringify(learnedContext));
assertTrue(learnedContext.scopes.flow.indexOf("flow.weather.body.metropoles.city") !== -1,
	"Flow context did not expose learned HTTP JSON schema paths");
var learnedLoopContext = JSON.parse(engine.context(JSON.stringify({
	flowName: schemaFlowName,
	flowSource: weatherFlowSource,
	node: "keepHotCity",
	include: ["current"],
	detail: "compact"
})));
print(JSON.stringify(learnedLoopContext));
assertTrue(learnedLoopContext.scopes.current.indexOf("current.city") !== -1 &&
	learnedLoopContext.scopes.current.indexOf("current.temperature") !== -1,
	"Flow context did not expose iterated item fields from a learned array schema");
var schemaReset = JSON.parse(engine.schemaReset(JSON.stringify({
	flowName: schemaFlowName,
	node: "fetchWeather"
})));
print(JSON.stringify(schemaReset));
assertTrue(schemaReset.ok === true && schemaReset.deleted === true && !schemaFile.isFile(),
	"Flow schema reset did not delete the learned node schema");

var compactWeatherFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fetchWeather",
	"    block: http.request",
	"    method: GET",
	"    url: \"{{ config.weatherUrl }}\"",
	"    headers:",
	"      X-Api-Key: \"{{ config.apiKey }}\"",
	"    out: flow.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: flow.weather",
	"    path: body.metropoles",
	"    out: flow.metropoles",
	"  - id: filterHot",
	"    block: list.filter",
	"    items: flow.metropoles",
	"    where: current.temperature >= config.threshold",
	"    out: flow.hotMetropoles",
	"  - id: sortHot",
	"    block: list.sort",
	"    items: flow.hotMetropoles",
	"    by: current.city",
	"    out: flow.sortedHotMetropoles",
	"  - id: mapCities",
	"    block: list.map",
	"    items: flow.sortedHotMetropoles",
	"    select: current.city",
	"    out: result.hotCities",
	"  - id: notify",
	"    block: email.mock",
	"    to: ops@example.com",
	"    subject: Weather alert",
	"    body: \"Hot cities over {{ config.threshold }}C: {{ result.hotCities }}\"",
	"    out: result.notification",
	"  - id: message",
	"    block: set",
	"    path: result.message",
	"    value: Weather alert computed with catalogue blocks",
	""
].join("\n");

var compactWeatherAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: compactWeatherFlowSource })));
print(JSON.stringify(compactWeatherAnalysis));
assertTrue(compactWeatherAnalysis.writes.indexOf("flow.hotMetropoles") !== -1,
	"Compact weather analysis did not report list.filter output");

var compactWeatherRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: compactWeatherFlowSource,
	config: {
		weatherUrl: fixtureUrl,
		apiKey: "demo-key",
		threshold: 35
	}
})));
print(JSON.stringify(compactWeatherRun));
assertTrue(compactWeatherRun.result.hotCities.join(",") === "Marseille,Paris",
	"Compact weather flow did not filter, sort and map hot cities");

var standardDataFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceProfile",
	"    block: set",
	"    path: flow.profile",
	"    value:",
	"      city: Paris",
	"      metrics:",
	"        temperature: 38",
	"        unit: C",
	"  - id: pickFields",
	"    block: object.pick",
	"    source: flow.profile",
	"    keys:",
	"      - city",
	"      - metrics.temperature",
	"    out: flow.selected",
	"  - id: mergeAlert",
	"    block: object.merge",
	"    target: flow.selected",
	"    source:",
	"      alert: true",
	"    out: result.payload",
	"  - id: stringify",
	"    block: json.stringify",
	"    value: \"{{ result.payload }}\"",
	"    out: flow.payloadText",
	"  - id: parse",
	"    block: json.parse",
	"    text: \"{{ flow.payloadText }}\"",
	"    out: result.roundtrip",
	""
].join("\n");
var standardDataRun = JSON.parse(engine.run(JSON.stringify({ flowSource: standardDataFlowSource })));
print(JSON.stringify(standardDataRun));
assertTrue(standardDataRun.result.payload.city === "Paris" &&
	standardDataRun.result.payload.temperature === 38 &&
	standardDataRun.result.payload.alert === true &&
	standardDataRun.result.roundtrip.city === "Paris",
	"Standard data blocks did not pick, merge, stringify and parse correctly");

var inputFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ input.city }}\"",
	"  - id: setTags",
	"    block: set",
	"    path: result.tags",
	"    value: \"{{ input.tags }}\"",
	"  - id: setBodyMessage",
	"    block: set",
	"    path: result.message",
	"    value: \"{{ input.message }}\"",
	""
].join("\n");
var inputRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: inputFlowSource,
	input: {
		city: "Paris",
		tags: ["hot", "capital"],
		message: "from body"
	}
})));
print(JSON.stringify(inputRun));
assertTrue(inputRun.result.city === "Paris" &&
	inputRun.result.tags.join(",") === "hot,capital" &&
	inputRun.result.message === "from body",
	"Flow input scope did not expose request input");

var smokeFlowsDir = new java.io.File(projectDirFile, "libs/flows");
smokeFlowsDir.mkdirs();
var namedGreetingFlowSource = [
	"version: 1",
	"input:",
	"  name: string",
	"output:",
	"  message: string",
	"  mode: string",
	"nodes:",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: \"Hello {{ input.name }}{{ config.suffix }}\"",
	"  - id: setMode",
	"    block: set",
	"    path: result.mode",
	"    value: rhino-flow",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "NamedGreeting.flow.yaml"),
	namedGreetingFlowSource,
	"UTF-8"
);
var parentFlowCallSource = [
	"version: 1",
	"nodes:",
	"  - id: callGreeting",
	"    block: flow.call",
	"    flow: NamedGreeting",
	"    input:",
	"      name: \"{{ input.name }}\"",
	"    config:",
	"      suffix: \" from Flow.call\"",
	"    out: result.greeting",
	""
].join("\n");
var parentFlowCallRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: parentFlowCallSource,
	input: {
		name: "Nicolas"
	}
})));
print(JSON.stringify(parentFlowCallRun));
assertTrue(parentFlowCallRun.result.greeting.message === "Hello Nicolas from Flow.call" &&
	parentFlowCallRun.result.greeting.mode === "rhino-flow",
	"flow.call did not run a named sidecar and return direct JSON");
var parentFlowCallAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: parentFlowCallSource })));
print(JSON.stringify(parentFlowCallAnalysis));
assertTrue(parentFlowCallAnalysis.writes.indexOf("result.greeting.message") !== -1 &&
	parentFlowCallAnalysis.writes.indexOf("result.greeting.mode") !== -1,
	"flow.call did not propagate the child Flow output contract");
var requestableCallSource = [
	"version: 1",
	"nodes:",
	"  - id: callRequestable",
	"    block: requestable.call",
	"    requestable: .NamedGreeting",
	"    input:",
	"      name: Nicolas",
	"    out: flow.response",
	""
].join("\n");
var requestableCallAnalysis = JSON.parse(engine.analyze(JSON.stringify({
	flowSource: requestableCallSource,
	context: {
		project: "SmokeProject"
	}
})));
print(JSON.stringify(requestableCallAnalysis));
assertTrue(requestableCallAnalysis.writes.indexOf("flow.response") !== -1,
	"requestable.call did not expose its output path during analysis");
var contractDefaultImplementationSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ input.city }}\"",
	"  - id: setTemperature",
	"    block: set",
	"    path: result.temperature",
	"    value: 42",
	"  - id: setUnit",
	"    block: set",
	"    path: result.unit",
	"    value: \"{{ input.unit }}\"",
	"  - id: setProvider",
	"    block: set",
	"    path: result.provider",
	"    value: DefaultMock",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureDefaultMock.flow.yaml"),
	contractDefaultImplementationSource,
	"UTF-8"
);
var contractOverrideImplementationSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ request.input.city }}\"",
	"  - id: setTemperature",
	"    block: set",
	"    path: result.temperature",
	"    value: 20",
	"  - id: setUnit",
	"    block: set",
	"    path: result.unit",
	"    value: \"{{ request.input.unit }}\"",
	"  - id: setProvider",
	"    block: set",
	"    path: result.provider",
	"    value: OverrideMock",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureOverrideMock.flow.yaml"),
	contractOverrideImplementationSource,
	"UTF-8"
);
var contractProjectImplementationSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ request.input.city }}\"",
	"  - id: setTemperature",
	"    block: set",
	"    path: result.temperature",
	"    value: 12",
	"  - id: setUnit",
	"    block: set",
	"    path: result.unit",
	"    value: \"{{ request.input.unit }}\"",
	"  - id: setProvider",
	"    block: set",
	"    path: result.provider",
	"    value: ProjectEngineMock",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureProjectMock.flow.yaml"),
	contractProjectImplementationSource,
	"UTF-8"
);
var smokeFlowEngineDir = new java.io.File(projectDirFile, "libs/flow");
smokeFlowEngineDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowEngineDir, "engine.yaml"),
	[
		"version: 1",
		"bindings:",
		"  weather.projectTemperature@1: WeatherTemperatureProjectMock",
		"config:",
		"  weather:",
		"    unit: C",
		""
	].join("\n"),
	"UTF-8"
);
var describedEngineTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: [
		"version: 1",
		"engineQName: lib_flow_engine.Engine",
		"bindings:",
		"  weather.projectTemperature@1: WeatherTemperatureProjectMock",
		"config:",
		"  weather:",
		"    unit: C",
		""
	].join("\n")
})));
print(JSON.stringify(describedEngineTree));
assertTrue(describedEngineTree.children[0].kind === "engine" &&
	describedEngineTree.children.some(function (child) { return child.name === "catalog"; }),
	"describeTree(engine) did not expose engine metadata and catalog");
var mutatedEngine = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "engine",
	engineSource: [
		"version: 1",
		"bindings: {}",
		"config:",
		"  weather:",
		"    unit: C",
		""
	].join("\n"),
	mutation: {
		op: "replace",
		path: "/config/weather/unit",
		value: "F"
	}
})));
print(JSON.stringify(mutatedEngine));
assertTrue(mutatedEngine.ok === true &&
	mutatedEngine.children.some(function (child) {
		return child.name === "config" && child.definition.indexOf('"unit":"F"') !== -1;
	}),
	"applyMutation(engine) did not update config");

var contractFlowSource = [
	"version: 1",
	"contracts:",
	"  weather.currentTemperature@1:",
	"    input:",
	"      city: string",
	"      unit: C|F",
	"    output:",
	"      city: string",
	"      temperature: number",
	"      unit: C|F",
	"      provider: string",
	"    defaultImplementation: WeatherTemperatureDefaultMock",
	"nodes:",
	"  - id: getTemperature",
	"    block: use",
	"    contract: weather.currentTemperature@1",
	"    input:",
	"      city:",
	"        value: Paris",
	"      unit:",
	"        value: C",
	"    out: result.weather",
	""
].join("\n");
var contractDefaultRun = JSON.parse(engine.run(JSON.stringify({ flowSource: contractFlowSource })));
print(JSON.stringify(contractDefaultRun));
assertTrue(contractDefaultRun.result.weather.temperature === 42 &&
	contractDefaultRun.result.weather.provider === "DefaultMock",
	"Contract use did not run defaultImplementation");

var contractOverrideRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: contractFlowSource,
	config: {
		bindings: {
			"weather.currentTemperature@1": "WeatherTemperatureOverrideMock"
		}
	}
})));
print(JSON.stringify(contractOverrideRun));
assertTrue(contractOverrideRun.result.weather.temperature === 20 &&
	contractOverrideRun.result.weather.provider === "OverrideMock",
	"Contract use did not honor config binding override");

var projectBindingFlowSource = [
	"version: 1",
	"contracts:",
	"  weather.projectTemperature@1:",
	"    defaultImplementation: WeatherTemperatureDefaultMock",
	"nodes:",
	"  - id: getTemperature",
	"    block: use",
	"    contract: weather.projectTemperature@1",
	"    input:",
	"      city:",
	"        value: Lyon",
	"      unit:",
	"        value: \"{{ config.weather.unit }}\"",
	"    out: result.weather",
	""
].join("\n");
var projectBindingRun = JSON.parse(engine.run(JSON.stringify({ flowSource: projectBindingFlowSource })));
print(JSON.stringify(projectBindingRun));
assertTrue(projectBindingRun.result.weather.temperature === 12 &&
	projectBindingRun.result.weather.provider === "ProjectEngineMock",
	"Contract use did not honor project FlowEngine binding");

var mcpFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: handleMcp",
	"    block: mcp.flow",
	"    request: config.request",
	"    out: result.response",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result.response }}\"",
	""
].join("\n");

var mcpList = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list"
		}
	}
})));
print(JSON.stringify(mcpList));
assertTrue(mcpList.ok === true, "MCP Flow tools/list wrapper failed");
assertTrue(mcpList.result.result.tools.length >= 11, "MCP Flow tools/list returned too few tools");

var customBlockSource = [
	"(function () {",
	"	return {",
	"		name: \"weather.hotCities\",",
	"		catalog: function () {",
	"			return {",
	"				name: \"weather.hotCities\",",
	"				props: {",
	"					items: { kind: \"expression\", type: \"array\" },",
	"					threshold: { kind: \"expression\", type: \"number\" },",
	"					out: { kind: \"path\", mode: \"write\" }",
	"				},",
	"				description: \"Returns sorted city names whose temperature is greater than or equal to a threshold.\"",
	"			};",
	"		},",
	"		analyze: function (ctx, node) {",
	"			var props = ctx.props(node);",
	"			ctx.addPath(props.out);",
	"		},",
	"		run: function (ctx, node) {",
	"			var props = ctx.props(node);",
	"			var items = ctx.expr(props.items) || [];",
	"			var threshold = Number(ctx.expr(props.threshold));",
	"			var cities = [];",
	"			for (var i = 0; i < items.length; i++) {",
	"				var item = items[i];",
	"				if (Number(item.temperature) >= threshold) {",
	"					cities.push(String(item.city));",
	"				}",
	"			}",
	"			cities.sort();",
	"			return cities;",
	"		}",
	"	};",
	"}())",
	""
].join("\n");

var mcpCreateBlock = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 4,
			method: "tools/call",
			params: {
				name: "flow-block-create",
				arguments: {
					name: "weather.hotCities",
					source: customBlockSource
				}
			}
		}
	}
})));
print(JSON.stringify(mcpCreateBlock));
assertTrue(mcpCreateBlock.result.result.structuredContent.origin === "project",
	"MCP Flow flow-block-create did not create a project block");

var mcpGetBlock = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 5,
			method: "tools/call",
			params: {
				name: "flow-block-get",
				arguments: {
					name: "weather.hotCities"
				}
			}
		}
	}
})));
print(JSON.stringify(mcpGetBlock));
assertTrue(mcpGetBlock.result.result.structuredContent.source.indexOf("weather.hotCities") !== -1,
	"MCP Flow flow-block-get did not return the custom block source");

var customBlockFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fetchWeather",
	"    block: http.request",
	"    method: GET",
	"    url: \"{{ config.weatherUrl }}\"",
	"    headers:",
	"      X-Api-Key: \"{{ config.apiKey }}\"",
	"    out: flow.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: flow.weather",
	"    path: body.metropoles",
	"    out: flow.metropoles",
	"  - id: hotCities",
	"    block: weather.hotCities",
	"    items: flow.metropoles",
	"    threshold: config.threshold",
	"    out: result.hotCities",
	""
].join("\n");

var mcpTestBlock = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 6,
			method: "tools/call",
			params: {
				name: "flow-block-test",
				arguments: {
					flowSource: customBlockFlowSource,
					config: {
						weatherUrl: fixtureUrl,
						apiKey: "demo-key",
						threshold: 35
					}
				}
			}
		}
	}
})));
print(JSON.stringify(mcpTestBlock));
assertTrue(mcpTestBlock.result.result.structuredContent.result.hotCities.join(",") === "Marseille,Paris",
	"MCP Flow flow-block-test did not run the custom project block");

var mcpSetFlow = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 7,
			method: "tools/call",
			params: {
				name: "flow-set",
				arguments: {
					name: "WeatherAlertCustom",
					flowSource: customBlockFlowSource
				}
			}
		}
	}
})));
print(JSON.stringify(mcpSetFlow));
assertTrue(mcpSetFlow.result.result.structuredContent.ok === true,
	"MCP Flow flow-set did not write the sidecar");

var mcpListFlows = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 8,
			method: "tools/call",
			params: {
				name: "flow-list",
				arguments: {}
			}
		}
	}
})));
print(JSON.stringify(mcpListFlows));
var flowNames = mcpListFlows.result.result.structuredContent.flows.map(function (flow) {
	return flow.name;
});
assertTrue(flowNames.indexOf("WeatherAlertCustom") !== -1,
	"MCP Flow flow-list did not return the created sidecar");

var mcpGetFlow = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 9,
			method: "tools/call",
			params: {
				name: "flow-get",
				arguments: {
					name: "WeatherAlertCustom"
				}
			}
		}
	}
})));
print(JSON.stringify(mcpGetFlow));
assertTrue(mcpGetFlow.result.result.structuredContent.source.indexOf("weather.hotCities") !== -1,
	"MCP Flow flow-get did not return the sidecar source");

var mcpTestFlow = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 10,
			method: "tools/call",
			params: {
				name: "flow-test",
				arguments: {
					name: "WeatherAlertCustom",
					config: {
						weatherUrl: fixtureUrl,
						apiKey: "demo-key",
						threshold: 35
					}
				}
			}
		}
	}
})));
print(JSON.stringify(mcpTestFlow));
assertTrue(mcpTestFlow.result.result.structuredContent.result.hotCities.join(",") === "Marseille,Paris",
	"MCP Flow flow-test did not run the named sidecar");

var mcpAnalyze = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/call",
			params: {
				name: "flow-analyze",
				arguments: {
					flowSource: weatherFlowSource
				}
			}
		}
	}
})));
print(JSON.stringify(mcpAnalyze));
assertTrue(mcpAnalyze.result.result.structuredContent.writes.indexOf("result.hotCities") !== -1,
	"MCP Flow flow-analyze did not report result.hotCities");

var mcpContext = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 11,
			method: "tools/call",
			params: {
				name: "flow-context",
				arguments: {
					flowSource: weatherFlowSource,
					node: "notify",
					property: "body",
					include: ["flow"],
					detail: "compact"
				}
			}
		}
	}
})));
print(JSON.stringify(mcpContext));
assertTrue(mcpContext.result.result.structuredContent.scopes.flow.indexOf("flow.metropoles") !== -1,
	"MCP Flow flow-context did not expose compact flow paths");

var mcpRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: mcpFlowSource,
	includeTrace: false,
	config: {
		request: {
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: {
				name: "flow-run",
				arguments: {
					flowSource: weatherFlowSource,
					config: {
						weatherUrl: fixtureUrl,
						apiKey: "demo-key",
						threshold: 35
					}
				}
			}
		}
	}
})));
print(JSON.stringify(mcpRun));
assertTrue(mcpRun.result.result.structuredContent.result.hotCities.length === 2,
	"MCP Flow flow-run did not return the expected hot cities");
