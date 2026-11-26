var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var project = java.nio.file.Files.createTempDirectory("block-lookup-visibility-").toFile();
var __flowEngineDir = String(new File(arguments[0]).getCanonicalPath());
var __flowProjectDir = String(project.getCanonicalPath());
var engine = eval(String(files.readFileToString(new File(__flowEngineDir, "Engine.js"), "UTF-8")));

try {
	function block(name, extra) {
		files.writeStringToFile(new File(project, "_flow/blocks/lookup/" + name + ".block.js"),
			"const _meta = { sourceVersion: 2, description: 'Lookup option'" + extra + " };\n" +
			"function " + name + "({ input, config, result }) {\n  result.value = true\n}\n", "UTF-8");
	}
	var guessed = "lookup.ledgerEntry";
	block("ledgerEntryPublic", "");
	block("ledgerEntryPrivate", ", private: true, aliases: ['" + guessed + "']");
	block("ledgerEntryInternal", ", visibility: 'internal', aliases: ['" + guessed + "']");

	var answer = JSON.parse(engine.blockGet(JSON.stringify({ name: guessed })));
	var error = answer.error;
	var candidates = error && error.details.candidates.map(function (candidate) { return candidate.block; });
	if (!error || error.code !== "UNKNOWN_BLOCK" || candidates.indexOf("lookup.ledgerEntryPublic") < 0 ||
		candidates.indexOf("lookup.ledgerEntryPrivate") >= 0 || candidates.indexOf("lookup.ledgerEntryInternal") >= 0) {
		throw new Error("A stronger hidden alias must not suppress the public suggestion: " + JSON.stringify(answer));
	}
	print("block-lookup-visibility OK");
} finally {
	files.deleteDirectory(project);
}
