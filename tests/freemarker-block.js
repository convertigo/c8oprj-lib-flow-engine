// template.freemarker: templates of the project resources and inline templates, HTML escaping, includes kept inside
// _flow/resources, plain data only (no ?new, no ?api), explicit errors.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var project = java.nio.file.Files.createTempDirectory("lib-flow-engine-freemarker").toFile();
function write(path, content) {
	files.writeStringToFile(new java.io.File(project, path), content, "UTF-8");
}
write("_flow/resources/emails/welcome.ftlh", "<p>Hello ${name}</p><a href=\"${url}\">confirm</a> <#list items as item>[${item}]</#list> n=${count} <#include \"parts/footer.ftlh\">");
write("_flow/resources/emails/parts/footer.ftlh", "<footer>${appName}</footer>");
write("_flow/resources/emails/plain.ftl", "Hello ${name}");
write("_flow/resources/emails/escape.ftlh", "<#include \"../../../secret.txt\">");
write("secret.txt", "TOP SECRET");
write("_flow/resources/emails/optional.ftlh", "Hi ${nickname!\"friend\"}");
write("_flow/resources/emails/greeting.ftlh", "Hello ${name}");
write("_flow/resources/emails/greeting_fr.ftlh", "Bonjour ${name}");

var source = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(project.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function run(props) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: [{ id: "it", block: "template.freemarker", props: props, out: "result.it" }] }, includeTrace: false })));
}

function one(props) {
	var out = run(props);
	assertTrue(out.ok === true, "render failed: " + JSON.stringify(out).substring(0, 800));
	return out.result.it;
}

function error(props) {
	var out = run(props);
	assertTrue(out.ok === false && out.error, "should fail: " + JSON.stringify(out).substring(0, 800));
	return out.error;
}

var values = { name: "Ada <script>", url: "https://app.example.org/confirm?key=a&b", items: ["x", "y"], count: 1234567, appName: "Flow & Co" };
var html = one({ file: "_flow/resources/emails/welcome.ftlh", values: values });
assertTrue(html.indexOf("<p>Hello Ada &lt;script&gt;</p>") === 0, "values escaped for HTML: " + html);
assertTrue(html.indexOf("href=\"https://app.example.org/confirm?key=a&amp;b\"") !== -1, "attribute escaped: " + html);
assertTrue(html.indexOf("[x][y]") !== -1 && html.indexOf("n=1234567") !== -1, "lists and numbers without grouping: " + html);
assertTrue(html.indexOf("<footer>Flow &amp; Co</footer>") !== -1, "include inside _flow/resources: " + html);
assertTrue(one({ file: "_flow/resources/emails/plain.ftl", values: values }) === "Hello Ada <script>", "a .ftl template is plain text");
assertTrue(one({ file: "_flow/resources/emails/optional.ftlh", values: {} }) === "Hi friend", "explicit default of an optional value");
assertTrue(one({ template: "<b>${name}</b>", values: values }) === "<b>Ada &lt;script&gt;</b>", "inline html by default");
assertTrue(one({ template: "${name}", format: "plain", values: values }) === "Ada <script>", "inline plain");

assertTrue(one({ file: "_flow/resources/emails/greeting.ftlh", locale: "fr", values: { name: "Ada" } }) === "Bonjour Ada", "fr variant");
assertTrue(one({ file: "_flow/resources/emails/greeting.ftlh", locale: "fr-CA", values: { name: "Ada" } }) === "Bonjour Ada", "fr-CA falls back to fr");
assertTrue(one({ file: "_flow/resources/emails/greeting.ftlh", locale: "de", values: { name: "Ada" } }) === "Hello Ada", "de falls back to the default");
assertTrue(one({ file: "_flow/resources/emails/greeting.ftlh", values: { name: "Ada" } }) === "Hello Ada", "no locale, the default");
assertTrue(error({ file: "_flow/resources/emails/greeting.ftlh", locale: "../x" }).code === "FREEMARKER_LOCALE_INVALID", "a locale is a language tag");

var missing = error({ template: "Hello ${nobody}", values: {} });
assertTrue(missing.code === "FREEMARKER_TEMPLATE_ERROR" && /nobody/.test(missing.message), "an undefined value is an error: " + JSON.stringify(missing));
assertTrue(error({ file: "_flow/resources/emails/none.ftlh" }).code === "FREEMARKER_TEMPLATE_NOT_FOUND", "missing file");
assertTrue(error({ file: "secret.txt" }).code === "FREEMARKER_TEMPLATE_PATH_INVALID", "outside _flow/resources");
assertTrue(error({ file: "_flow/resources/../secret.ftl" }).code === "FREEMARKER_TEMPLATE_PATH_INVALID", "no .. in a template path");
var escaped = run({ file: "_flow/resources/emails/escape.ftlh" });
assertTrue(escaped.ok === false && JSON.stringify(escaped).indexOf("TOP SECRET") === -1, "an include cannot leave _flow/resources: " + JSON.stringify(escaped).substring(0, 300));
var created = run({ template: "<#assign ex=\"freemarker.template.utility.Execute\"?new()>${ex(\"id\")}" });
assertTrue(created.ok === false && JSON.stringify(created).indexOf("uid=") === -1, "?new cannot instantiate a class: " + JSON.stringify(created).substring(0, 300));
var api = run({ template: "${name?api}", values: values });
assertTrue(api.ok === false, "?api is disabled: " + JSON.stringify(api).substring(0, 300));
assertTrue(error({ template: "<#if>" }).code === "FREEMARKER_TEMPLATE_INVALID", "a syntax error is reported");
assertTrue(error({}).code === "FREEMARKER_TEMPLATE_REQUIRED", "a template is required");

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "freemarker", detail: "full" })));
var block = catalog.blocks.filter(function (item) { return item.blockId === "template.freemarker"; })[0];
assertTrue(block && block.props.values.kind === "value" && block.props.file.kind === "template" && block.props.locale.kind === "template", "catalog exposes template.freemarker");
print("template.freemarker: ok");
