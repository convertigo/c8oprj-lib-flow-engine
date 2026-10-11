// schema.adopt replaces the output of a Flow (_flow.outputs, in the working copy of its source) or adopts the schema of
// one of its nodes, for an administrator or an authenticated MCP call only. Dry run, revision of what is replaced,
// optional revision of the Flow read, draft or save of the Flow source alone; a proposal is never adopted implicitly.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-schema-adopt-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
function assert(value, message) { if (!value) throw new Error(message); }
function refused(code, fn) {
	try { fn(); } catch (e) { return e.code === code ? e : null; }
	return null;
}
try {
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var service = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/authoring-primitive-service.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function sha(text) { return String(Packages.org.apache.commons.codec.digest.DigestUtils.sha256Hex(String(text))); }
	var flowCode = 'const _flow = {\n  "sourceVersion": 2,\n  "outputs": {\n    "page": { "type": "object" },\n  },\n}\n\nfunction CouchPage({ input, config, result }) {\n  result.page = { rows: [] }\n  return result\n}\n';
	var flow = {
		text: flowCode, dirty: false, saves: 0,
		getName: function () { return "CouchPage"; },
		getFlowSource: function () { return this.text; },
		setFlowSource: function (value) { this.text = String(value); this.dirty = true; },
		isFlowSourceDirty: function () { return this.dirty; },
		saveFlowSourceFile: function () { this.dirty = false; this.saves++; }
	};
	var nodeSchemas = {};
	var logs = [];
	var env = {
		raise: function (code, message) { var e = new Error(message); e.code = code; throw e; },
		log: function (message) { logs.push(String(message)); },
		studioMode: function () { return false; },
		isInternalRequest: function () { return false; },
		isWebAdmin: function (session) { return session.admin === true; },
		xsrfToken: function (session) { return session.token || ""; },
		sessionUser: function () { return "admin"; },
		sha256Hex: sha,
		projectFlow: function (projectName, name) { return projectName === "lib_couch" && name === "CouchPage" ? flow : null; },
		flowDefinition: function (source) {
			var validated = api("flowSourceValidate", { name: "CouchPage", code: String(source) });
			assert(validated.ok, "valid Flow: " + JSON.stringify(validated));
			return validated.definition;
		},
		applyFlowMutation: function (source, name, mutation) {
			var response = api("applyMutation", { target: "flow", flowSource: source, name: name, flowName: name, mutations: [mutation], includeTree: false });
			assert(response.ok, "mutation: " + JSON.stringify(response));
			return response.source;
		},
		draftFlowSource: function (target, before, after, onConflict) {
			if (target.getFlowSource() !== before) onConflict();
			target.setFlowSource(after);
		},
		saveFlowSource: function (target, before, after, onConflict) {
			if (target.isFlowSourceDirty()) env.raise("SCHEMA_DRAFT_EXISTS", "draft");
			if (target.getFlowSource() !== before) onConflict();
			target.setFlowSource(after);
			target.saveFlowSourceFile();
		},
		nodeSchema: function (projectName, name, node, schema) {
			if (schema !== null) nodeSchemas[node] = schema;
			return { schema: nodeSchemas[node] === undefined ? null : nodeSchemas[node], file: "_flow/schemas/" + name + "/" + node + ".out.schema.json" };
		}
	};
	function context(options) {
		options = options || {};
		return { httpServletRequest: {
			getAttribute: function (name) { return name === service.PRINCIPAL_ATTRIBUTE ? options.mcp || null : null; },
			getSession: function () { return options.session || null; },
			getMethod: function () { return "POST"; },
			getHeader: function () { return options.token || null; },
			getParameter: function () { return null; }
		} };
	}
	var mcp = context({ mcp: "mcp:agent" });
	var document = { type: "object", properties: {
		page: { type: "object", properties: { rows: { type: "array", items: { type: "object", properties: {
			key: { type: "object" }, values: { type: "object", properties: { document: { type: "object", properties: { label: { type: "string" } } } } }
		} } } } }
	} };

	assert(refused("AUTHORING_FORBIDDEN", function () {
		service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: document, dryRun: true }, context({}), env);
	}), "anonymous may not, dry run included");
	assert(refused("SCHEMA_REQUIRED", function () {
		service.schemaAdopt({ qname: "lib_couch.CouchPage", dryRun: true }, mcp, env);
	}), "the complete schema is required");

	// the output of the Flow
	var dry = service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: document, dryRun: true }, mcp, env);
	assert(dry.target === "flow" && dry.dryRun && dry.persisted === "none" && dry.changed
		&& dry.before.page.type === "object" && !dry.before.page.properties
		&& dry.after.page.properties.rows.items.properties.values.properties.document.properties.label.type === "string"
		&& dry.previousRevision === sha(flowCode) && flow.text === flowCode, "a dry run tells the change: " + JSON.stringify(dry));
	assert(refused("SCHEMA_REVISION_CONFLICT", function () {
		service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: document, dryRun: true, flowRevision: sha("another Flow") }, mcp, env);
	}), "a change of the Flow read is a conflict");
	assert(refused("SCHEMA_REVISION_REQUIRED", function () {
		service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: document }, mcp, env);
	}), "persisting requires the revision read");
	var draft = service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: document, revision: dry.previousRevision }, mcp, env);
	assert(draft.persisted === "draft" && flow.dirty && flow.text.indexOf("document") > 0 && draft.revision === sha(flow.text),
		"a draft is the working copy of the Flow source: " + flow.text);
	assert(env.flowDefinition(flow.text).flow.outputs.page.properties.rows, "the Flow stays valid with its new outputs");
	assert(refused("SCHEMA_DRAFT_EXISTS", function () {
		service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: { type: "object", properties: { page: { type: "object" } } }, revision: draft.revision, persist: "save" }, mcp, env);
	}), "save is refused over unsaved changes of the Flow");
	flow.dirty = false;
	var saved = service.schemaAdopt({ qname: "lib_couch.CouchPage", schema: { type: "object", properties: { page: { type: "object" } } }, revision: draft.revision, persist: "save" }, mcp, env);
	assert(saved.persisted === "saved" && flow.saves === 1 && !flow.dirty, "save writes the Flow source alone: " + JSON.stringify(saved));

	// the schema of a node, which has no working copy
	var nodeDry = service.schemaAdopt({ qname: "lib_couch.CouchPage", node: "page", schema: document, dryRun: true }, mcp, env);
	assert(nodeDry.target === "node" && nodeDry.before === null && nodeDry.persisted === "none" && nodeSchemas.page === undefined, "node dry run: " + JSON.stringify(nodeDry));
	var nodeSaved = service.schemaAdopt({ qname: "lib_couch.CouchPage", node: "page", schema: document, revision: nodeDry.previousRevision }, mcp, env);
	assert(nodeSaved.persisted === "saved" && nodeSchemas.page === document && nodeSaved.path.indexOf("page.out.schema.json") > 0, "node schema written: " + JSON.stringify(nodeSaved));
	assert(refused("SCHEMA_REVISION_CONFLICT", function () {
		service.schemaAdopt({ qname: "lib_couch.CouchPage", node: "page", schema: { type: "object" }, revision: nodeDry.previousRevision }, mcp, env);
	}), "the node schema changed since the dry run");
	var adoptions = logs.filter(function (line) { return line.indexOf("(schema.adopt)") === 0; });
	assert(adoptions.length === 3 && adoptions[0].indexOf("mcp agent: lib_couch.CouchPage outputs (draft)") > 0
		&& logs[0].indexOf("(authoring) refused") === 0, "the log tells who adopted what, and the refusal: " + logs);
	print("schema-adopt OK");
} finally {
	FileUtils.deleteQuietly(project);
}
