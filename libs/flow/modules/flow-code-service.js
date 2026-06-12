(function () {
	var memoryDrafts = {};

	function create(env) {
		env = env || {};
		var raise = env.raise;
		var normalizeFlowScriptFunctionSyntax = env.normalizeFlowScriptFunctionSyntax;
		var currentProjectName = env.currentProjectName;
		var renderFlowScript = env.renderFlowScript;
		var sha256Hex = env.sha256Hex;
		var flowScriptValidateRequest = env.flowScriptValidateRequest;
		var readProjectFlowWorkingCode = env.readProjectFlowWorkingCode;
		var writeProjectFlowWorkingCode = env.writeProjectFlowWorkingCode;
		var discardProjectFlowWorkingCopy = env.discardProjectFlowWorkingCopy;
		var flowScriptGetRequest = env.flowScriptGetRequest;
		var normalizeFlowScriptCode = env.normalizeFlowScriptCode;
		var stripFlowScriptMirrorHeader = env.stripFlowScriptMirrorHeader;
		var setProjectFlow = env.setProjectFlow;
		var applyUnifiedPatchText = env.applyUnifiedPatchText;
		var getBlockSource = env.getBlockSource;
		var setProjectBlockCode = env.setProjectBlockCode;
		var flowScriptBlockMetaFromRequest = env.flowScriptBlockMetaFromRequest;
		var flowScriptBlockCodeSource = env.flowScriptBlockCodeSource;
		var flowScriptBlockCandidates = env.flowScriptBlockCandidates || function () { return []; };
		var listProjectFlows = env.listProjectFlows;
		var runFlowRequest = env.runFlowRequest;
		var analyzeFlowSource = env.analyzeFlowSource;
		var normalizeTree = env.normalizeTree || function (value) { return value; };

	function flowCodeName(request) {
		request = request || {};
		var name = request.name || request.flowName || "";
		if (!name && request.qname) {
			var parts = String(request.qname).split(".");
			name = parts[parts.length - 1];
		}
		if (!name) {
			raise("MISSING_FLOW_QNAME", "flow-code requires qname or name.");
		}
		return String(name);
	}

	function flowCodeNameFromCode(code) {
		var match = normalizeFlowScriptFunctionSyntax(code).match(/\b(?:flow|function)\s+([A-Za-z_$][\w$]*)\s*\(/);
		return match ? String(match[1]) : "";
	}

	function flowCodeNameOptional(request, code, fallback) {
		request = request || {};
		var name = request.name || request.flowName || "";
		if (!name && request.qname) {
			var parts = String(request.qname).split(".");
			name = parts[parts.length - 1];
		}
		return String(name || flowCodeNameFromCode(code) || fallback || "FlowScript");
	}

	function flowCodeQName(request, name) {
		request = request || {};
		var project = currentProjectName(request);
		if (request.qname) {
			var qname = String(request.qname);
			if (qname.indexOf(".") !== -1) {
				return qname.charAt(0) === "." && project ? project + qname : qname;
			}
			return project ? project + "." + qname : qname;
		}
		return project ? project + "." + name : String(name);
	}

	function flowCodeDryRun(request) {
		return request && (request.dry === true || request.dryRun === true);
	}

	function flowCodeDraftMode(request) {
		request = request || {};
		return request.draft === true
			|| String(request.draft || "").toLowerCase() === "true"
			|| String(request.mode || "").toLowerCase() === "draft"
			|| String(request.stage || "").toLowerCase() === "draft";
	}

	function flowCodeOfficialMode(request) {
		request = request || {};
		return request.official === true
			|| request.draft === false
			|| String(request.official || "").toLowerCase() === "true"
			|| String(request.mode || "").toLowerCase() === "official"
			|| String(request.stage || "").toLowerCase() === "official";
	}

	function flowCodeMaxDiagnostics(request) {
		request = request || {};
		var value = request.maxDiagnostics !== undefined && request.maxDiagnostics !== null && request.maxDiagnostics !== ""
			? request.maxDiagnostics
			: request.diagnosticLimit !== undefined && request.diagnosticLimit !== null && request.diagnosticLimit !== ""
				? request.diagnosticLimit
				: request.diagnosticsLimit;
		var max = value === undefined || value === null || value === "" ? 8 : parseInt(String(value), 10);
		if (isNaN(max)) {
			max = 8;
		}
		return Math.max(1, Math.min(25, max));
	}

	function flowCodeDiagnostics(diagnostics, severity) {
		return (diagnostics || []).filter(function (diagnostic) {
			return !severity || diagnostic.severity === severity;
		}).map(function (diagnostic) {
			var out = {};
			["severity", "phase", "code", "line", "message", "block", "property", "path", "actual", "expected", "candidates", "next", "create", "hint"].forEach(function (key) {
				if (diagnostic[key] !== undefined && diagnostic[key] !== null && diagnostic[key] !== "") {
					out[key] = diagnostic[key];
				}
			});
			return out;
		});
	}

	function flowCodeDiagnosticReport(diagnostics, request, severity) {
		var all = flowCodeDiagnostics(diagnostics, severity);
		var limit = flowCodeMaxDiagnostics(request);
		var shown = all.slice(0, limit);
		return {
			diagnosticCount: all.length,
			diagnosticsShown: shown.length,
			hasMore: all.length > shown.length,
			diagnostics: shown
		};
	}

	function flowCodeAddDiagnosticReport(out, diagnostics, request, severity) {
		var report = flowCodeDiagnosticReport(diagnostics, request, severity);
		out.diagnosticCount = report.diagnosticCount;
		out.diagnosticsShown = report.diagnosticsShown;
		out.hasMore = report.hasMore;
		out.diagnostics = report.diagnostics;
		return out;
	}

	function flowCodeInputVariablesFrom(value) {
		var variables = {};
		function scanText(text) {
			text = String(text || "");
			var re = /\binput(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g;
			var match;
			while ((match = re.exec(text)) !== null) {
				var name = String(match[1] || match[2] || "").trim();
				if (name) {
					variables[name] = true;
				}
			}
		}
		function walk(any) {
			if (any === null || any === undefined) {
				return;
			}
			if (typeof any === "string") {
				scanText(any);
				return;
			}
			if (Object.prototype.toString.call(any) === "[object Array]") {
				any.forEach(walk);
				return;
			}
			if (typeof any === "object") {
				Object.keys(any).forEach(function (key) {
					walk(any[key]);
				});
			}
		}
		walk(value);
		return Object.keys(variables).sort();
	}

	function flowCodeFlowMetaFrom(definition) {
		definition = definition || {};
		var meta = definition.flow || definition._flow || {};
		return meta && typeof meta === "object" ? normalizeTree(meta) : {};
	}

	function flowCodeInputDefinitionsFrom(definition) {
		var meta = flowCodeFlowMetaFrom(definition);
		var inputs = meta.inputs || meta.input || definition && (definition.inputs || definition.input) || {};
		return inputs && typeof inputs === "object" ? normalizeTree(inputs) : {};
	}

	function flowCodeTestCasesFrom(definition) {
		var meta = flowCodeFlowMetaFrom(definition);
		var tests = meta.tests || meta.testCases || {};
		return tests && typeof tests === "object" ? normalizeTree(tests) : {};
	}

	function flowCodeAddInputReport(out, validation) {
		var definition = validation && validation.definition || {};
		var inputDefinitions = flowCodeInputDefinitionsFrom(definition);
		var inputVariables = flowCodeInputVariablesFrom(definition);
		Object.keys(inputDefinitions).forEach(function (name) {
			if (inputVariables.indexOf(name) === -1) {
				inputVariables.push(name);
			}
		});
		inputVariables.sort();
		if (inputVariables.length) {
			out.inputVariables = inputVariables;
		}
		if (Object.keys(inputDefinitions).length) {
			out.inputDefinitions = inputDefinitions;
		}
		var testCases = flowCodeTestCasesFrom(definition);
		if (Object.keys(testCases).length) {
			out.testCases = testCases;
		}
		return out;
	}

	function flowCodeParseDiagnostics(error) {
		var message = String(error && error.message || error || "FlowScript parse failed.");
		var line = 0;
		var match = message.match(/(?:line|at line)\s+(\d+)/i);
		if (match) {
			line = parseInt(match[1], 10) || 0;
		}
		return [{
			severity: "error",
			phase: "parse",
			code: String(error && error.code || "FLOWSCRIPT_PARSE_FAILED"),
			line: line,
			message: message,
			hint: error && error.hint ? String(error.hint) : "Fix the FlowScript syntax and retry."
		}];
	}

	function flowCodeExceptionDetails(error, request) {
		var details = error && error.details;
		if (Object.prototype.toString.call(details) === "[object Array]") {
			return flowCodeDiagnosticReport(details, request);
		}
		if (details !== undefined && details !== null) {
			return details;
		}
		return flowCodeDiagnosticReport(flowCodeParseDiagnostics(error), request);
	}

	function flowCodeError(code, message, hint, details) {
		var out = {
			code: String(code || "FLOW_CODE_ERROR"),
			message: String(message || "")
		};
		if (hint) {
			out.hint = String(hint);
		}
		if (details !== undefined && details !== null) {
			out.details = details;
		}
		return out;
	}

	function flowCodeRevisionForSource(blocks, name, source, request) {
		var code = renderFlowScript(blocks, name, source, Object.assign({}, request || {}, { includeHeader: false }));
		return sha256Hex(code);
	}

	function flowCodeValidate(blocks, request, name, code) {
		try {
			var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, {
				name: name,
				code: code
			}));
			return {
				validation: validation,
				warnings: flowCodeDiagnostics(validation.diagnostics, "warning"),
				error: null
			};
		} catch (e) {
			return {
				validation: null,
				warnings: [],
				error: flowCodeError(String(e.code || "FLOWSCRIPT_PARSE_FAILED"),
					String(e.message || e || "FlowScript validation failed."),
					e.hint || "Fix the FlowScript syntax and retry.",
					flowCodeExceptionDetails(e, request))
			};
		}
	}

	function flowCodeDraftRead(name) {
		var working = readProjectFlowWorkingCode ? readProjectFlowWorkingCode(name, true) : null;
		if (working) {
			return {
				ok: true,
				name: String(name),
				format: "flowscript",
				canonical: false,
				draft: true,
				file: working.file || "",
				codeFile: working.codeFile || working.file || "",
				revision: working.revision,
				code: working.code
			};
		}
		var draft = memoryDrafts[String(name)];
		if (!draft) {
			return null;
		}
		return {
			ok: true,
			name: String(name),
			format: "flowscript",
			canonical: false,
			draft: true,
			file: "",
			codeFile: "",
			revision: draft.revision,
			code: draft.code
		};
	}

	function flowCodeCurrentForEdit(blocks, request, name, preferDraft) {
		var draft = preferDraft ? flowCodeDraftRead(name) : null;
		if (draft) {
			draft.qname = flowCodeQName(request, name);
			return draft;
		}
		var current = flowCodeGetRequest(blocks, Object.assign({}, request, {
			name: name,
			draft: false,
			mode: "",
			stage: ""
		}));
		current.draft = false;
		return current;
	}

	function flowCodeGetRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		if (!flowCodeOfficialMode(request)) {
			var draft = flowCodeDraftRead(name);
			if (draft) {
				draft.qname = flowCodeQName(request, name);
				draft.next = "Working copy loaded. Check with flow-code-check, run with flow-code-run, then save with flow-code-promote.";
				return draft;
			}
		}
		var current = flowScriptGetRequest(blocks, Object.assign({}, request, { name: name, includeHeader: false }));
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			format: current.format,
			canonical: current.canonical === true,
			file: current.file,
			codeFile: current.codeFile,
			codeFromMirror: current.codeFromMirror,
			codeMirrorStale: current.codeMirrorStale,
			revision: current.revision,
			code: current.code
		};
	}

	function flowCodeOfficialRead(blocks, request, name) {
		try {
			return flowCodeGetRequest(blocks, Object.assign({}, request, {
				name: name,
				draft: false,
				mode: "",
				stage: ""
			}));
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW") {
				throw e;
			}
			return null;
		}
	}

	function flowCodeStatusRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var draft = flowCodeDraftRead(name);
		var official = flowCodeOfficialRead(blocks, request, name);
		var dirty = draft !== null && (!official || draft.revision !== official.revision);
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			exists: official !== null,
			dirty: dirty,
			workingCopy: draft !== null,
			revision: draft ? draft.revision : official ? official.revision : "",
			workingRevision: draft ? draft.revision : "",
			officialRevision: official ? official.revision : "",
			codeFile: draft ? draft.codeFile : official ? official.codeFile : "",
			workingCodeFile: draft ? draft.codeFile : "",
			officialCodeFile: official ? official.codeFile : "",
			next: dirty
				? "Working copy differs from the official Flow. Run/check it, promote it to save, or discard it."
				: "No unsaved FlowScript working copy."
		};
	}

	function flowCodeDiscardRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var memoryDiscarded = discardProjectFlowWorkingCopy ? discardProjectFlowWorkingCopy(name) : false;
		var discarded = memoryDrafts[String(name)] !== undefined;
		delete memoryDrafts[String(name)];
		var official = flowCodeOfficialRead(blocks, request, name);
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			exists: official !== null,
			dirty: false,
			workingCopy: false,
			discarded: memoryDiscarded || discarded,
			revision: official ? official.revision : "",
			officialRevision: official ? official.revision : "",
			codeFile: official ? official.codeFile : "",
			officialCodeFile: official ? official.codeFile : "",
			next: memoryDiscarded || discarded
				? "Working copy discarded. The official Flow is now the active source."
				: "No FlowScript working copy existed."
		};
	}

	function flowCodeDraftSetRequest(blocks, request, name, code) {
		var current = null;
		try {
			current = flowCodeCurrentForEdit(blocks, request, name, true);
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW") {
				throw e;
			}
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && current && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_DRAFT_REVISION_MISMATCH",
					"FlowScript working copy changed since it was read: " + name,
					"Call flow-code-get again and regenerate the patch from the new working copy revision."),
				warnings: []
			};
		}
		var normalized = normalizeFlowScriptCode(stripFlowScriptMirrorHeader(code));
		var written = writeProjectFlowWorkingCode ? writeProjectFlowWorkingCode(name, normalized, request) : null;
		if (!written) {
			memoryDrafts[String(name)] = {
				code: normalized,
				revision: sha256Hex(normalized)
			};
		}
		var revision = written && written.revision ? written.revision : memoryDrafts[String(name)].revision;
		var checked = flowCodeValidate(blocks, request, name, normalized);
		var out = {
			ok: checked.error === null && checked.validation && checked.validation.ok === true,
			qname: flowCodeQName(request, name),
			name: name,
			draft: true,
			written: true,
			format: "flowscript",
			canonical: false,
			file: written && written.file ? written.file : "",
			codeFile: written && written.codeFile ? written.codeFile : "",
			revision: revision,
			oldRevision: current ? current.revision : null,
			warnings: checked.warnings
		};
		flowCodeAddInputReport(out, checked.validation);
		if (out.ok) {
			flowCodeAddDiagnosticReport(out, checked.validation.diagnostics || [], request);
			out.next = "Working copy check passed. Run with flow-code-run without sending code, then save with flow-code-promote.";
		} else {
			out.error = checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
				"Patch the working copy and retry flow-code-check.", flowCodeDiagnosticReport(checked.validation.diagnostics, request));
		}
		return out;
	}

	function flowCodeSetRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var code = request.code !== undefined && request.code !== null ? String(request.code) : "";
		if (code.trim() === "") {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				error: flowCodeError("MISSING_CODE", "flow-code-set requires code."),
				warnings: []
			};
		}
		if (!flowCodeOfficialMode(request)) {
			return flowCodeDraftSetRequest(blocks, request, name, code);
		}
		var current = null;
		try {
			current = flowCodeGetRequest(blocks, Object.assign({}, request, { name: name }));
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW") {
				throw e;
			}
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && current && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_REVISION_MISMATCH",
					"FlowScript changed since it was read: " + name,
					"Call flow-code-get again and regenerate the patch from the new revision."),
				warnings: []
			};
		}
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, { name: name, code: code }));
		var warnings = flowCodeDiagnostics(validation.diagnostics, "warning");
		if (!validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				revision: current ? current.revision : null,
				error: flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
					"Fix the reported diagnostics and retry.", flowCodeDiagnosticReport(validation.diagnostics, request)),
				warnings: warnings
			};
		}
		var saved = null;
		if (!flowCodeDryRun(request)) {
			saved = setProjectFlow(blocks, name, validation.source, request);
		}
		var revision = saved && saved.codeRevision
			? saved.codeRevision
			: flowCodeRevisionForSource(blocks, name, validation.source, request);
		return flowCodeAddInputReport({
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			dry: flowCodeDryRun(request),
			format: "flowscript",
			canonical: true,
			file: saved ? saved.file : (current ? current.file : ""),
			codeFile: saved ? saved.codeFile : (current ? current.codeFile : ""),
			revision: revision,
			oldRevision: current ? current.revision : null,
			warnings: warnings
		}, validation);
	}

	function flowCodePatchRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var current = null;
		try {
			current = flowCodeCurrentForEdit(blocks, request, name, !flowCodeOfficialMode(request));
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW" ||
					request.code === undefined || request.code === null || String(request.code).trim() === "") {
				throw e;
			}
			return flowCodeSetRequest(blocks, Object.assign({}, request, {
				name: name,
				qname: flowCodeQName(request, name)
			}));
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: current.draft === true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_REVISION_MISMATCH",
					"FlowScript changed since it was read: " + name,
					"Call flow-code-get again and regenerate the patch from the new revision."),
				warnings: []
			};
		}
		var patch = request.codepatch || request.patch || request.unifiedDiff || request.diff || "";
		var code = request.code !== undefined && request.code !== null
			? String(request.code)
			: applyUnifiedPatchText(current.code, patch).content;
		if (!flowCodeOfficialMode(request)) {
			return flowCodeDraftSetRequest(blocks, Object.assign({}, request, {
				name: name,
				qname: flowCodeQName(request, name),
				revision: current.revision
			}), name, code);
		}
		return flowCodeSetRequest(blocks, Object.assign({}, request, {
			name: name,
			qname: flowCodeQName(request, name),
			code: code,
			revision: current.revision
		}));
	}

	function blockCodePatchRequest(blocks, request) {
		request = request || {};
		var name = String(request.name || request.block || "").trim();
		if (!name) {
			return {
				ok: false,
				name: name,
				error: flowCodeError("MISSING_BLOCK_NAME", "flow-block-code-patch requires name."),
				warnings: []
			};
		}
		var current = getBlockSource(blocks, name, Object.assign({}, request, { detail: "full" }));
		if ((current.format !== "flowscript" && current.format !== "blockjs") || !current.code) {
			return {
				ok: false,
				name: name,
				revision: current.codeRevision || "",
				error: flowCodeError("BLOCK_NOT_CANONICAL_CODE",
					"Block " + name + " is not stored as canonical .block.js.",
					"Use flow-block-code-get only for .block.js blocks, or duplicate/migrate the block first."),
				warnings: []
			};
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.codeRevision) {
			return {
				ok: false,
				name: name,
				revision: current.codeRevision,
				error: flowCodeError("BLOCK_CODE_REVISION_MISMATCH",
					"FlowScript block changed since it was read: " + name,
					"Call flow-block-code-get again and regenerate the patch from the new revision."),
				warnings: []
			};
		}
		var patch = request.codepatch || request.patch || request.unifiedDiff || request.diff || "";
		var code = request.code !== undefined && request.code !== null
			? String(request.code)
			: applyUnifiedPatchText(current.code, patch).content;
		var write = setProjectBlockCode(blocks, name, Object.assign({}, request, {
			name: name,
			code: code,
			revision: current.codeRevision
		}));
		return Object.assign({}, write, {
			oldRevision: current.codeRevision
		});
	}

	function blockCodeGetRequest(blocks, request) {
		request = request || {};
		var name = String(request.name || request.block || "").trim();
		if (!name) {
			return {
				ok: false,
				name: name,
				error: flowCodeError("MISSING_BLOCK_NAME", "flow-block-code-get requires name."),
				warnings: []
			};
		}
		if (!blocks[String(name)]) {
			var candidates = flowScriptBlockCandidates(blocks, name, 5);
			var exactCandidate = candidates.filter(function (candidate) {
				return String(candidate.block || "") === name;
			})[0];
			return {
				ok: false,
				name: name,
				error: flowCodeError("UNKNOWN_BLOCK", "Unknown Flow block: " + name,
					candidates.length
						? "Use one of the candidates, or call flow-catalog once if none matches. Do not probe arbitrary block names with flow-block-code-get."
						: "No matching block exists. For a domain-specific need, create a project block with flow-block-code-set; otherwise use flow-catalog once."),
				candidates: candidates,
				next: exactCandidate
					? "Use " + exactCandidate.block + "."
					: (candidates.length
						? "No exact block exists. Pick a candidate only if it matches the intent, otherwise create a project block."
						: "Use existing blocks directly, or create a project block if this is a new reusable concept."),
				warnings: []
			};
		}
		var block = getBlockSource(blocks, name, Object.assign({}, request, {
			detail: "full",
			includeMeta: true
		}));
		if ((block.format === "flowscript" || block.format === "blockjs") && block.code) {
			var direct = {
				ok: true,
				name: name,
				origin: block.origin,
				format: block.format,
				implementationRuntime: block.implementationRuntime,
				canonical: true,
				revision: block.codeRevision || "",
				code: block.code,
				descriptor: block.descriptor,
				warnings: []
			};
			if (request.includeSources === true || String(request.includeSources || "") === "true") {
				direct.codeFile = block.codeFile;
				direct.implementationSource = block.implementationSource;
			}
			return direct;
		}
		if (block.implementationRuntime !== "flow") {
			return {
				ok: false,
				name: name,
				error: flowCodeError("BLOCK_NOT_FLOWSCRIPT", "Block " + name + " is implemented with " + block.implementationRuntime + ".",
					"Use flow-block-get for legacy descriptor-backed Rhino blocks, or migrate the block to canonical .block.js."),
				warnings: []
			};
		}
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, {
			name: name,
			flowSource: block.implementationSource,
			includeHeader: false,
			includeImplicitReturn: false
		}));
		var meta = flowScriptBlockMetaFromRequest(name, { descriptor: block.descriptor });
		var code = flowScriptBlockCodeSource(name, validation.code, meta);
		var out = {
			ok: validation.ok !== false,
			name: name,
			origin: block.origin,
			format: "flowscript-mirror",
			canonical: false,
			revision: sha256Hex(code),
			code: code,
			descriptor: block.descriptor,
			diagnostics: validation.diagnostics || [],
			warnings: (validation.diagnostics || []).filter(function (diagnostic) {
				return diagnostic.severity === "warning";
			}),
			next: "Call flow-block-code-set with this full _meta + function code to migrate the project-local block to canonical .block.js."
		};
		if (request.includeSources === true || String(request.includeSources || "") === "true") {
			out.descriptorSource = block.descriptorSource;
			out.implementationSource = block.implementationSource;
		}
		return out;
	}

	function flowCodeRgExtract(code, matcher, context, limit) {
		var lines = String(code || "").split(/\r?\n/);
		var extracts = [];
		for (var i = 0; i < lines.length && extracts.length < limit; i++) {
			matcher.lastIndex = 0;
			if (matcher.test(lines[i])) {
				var start = Math.max(0, i - context);
				var end = Math.min(lines.length - 1, i + context);
				extracts.push({
					line: i + 1,
					startLine: start + 1,
					endLine: end + 1,
					code: lines.slice(start, end + 1).join("\n")
				});
			}
		}
		return extracts;
	}

	function codeRgMatcher(request, toolName) {
		var pattern = String(request && request.pattern || "");
		if (!pattern) {
			raise("MISSING_PATTERN", String(toolName || "code-rg") + " requires pattern.");
		}
		if (request.regex === true) {
			return new RegExp(pattern, request.caseSensitive === true ? "g" : "gi");
		}
		var escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(escaped, request.caseSensitive === true ? "g" : "gi");
	}

	function flowCodeRgMatcher(request) {
		return codeRgMatcher(request, "flow-code-rg");
	}

	function flowCodeRgRequest(blocks, request) {
		request = request || {};
		var matcher = flowCodeRgMatcher(request);
		var context = Math.max(0, Math.min(20, Number(request.context || request.contextLines || 2)));
		var limit = Math.max(1, Math.min(100, Number(request.limit || 20)));
		var targets = [];
		if (request.qname || request.name || request.flowName) {
			targets.push(flowCodeGetRequest(blocks, request));
		} else {
			listProjectFlows().flows.forEach(function (flow) {
				targets.push(flowCodeGetRequest(blocks, Object.assign({}, request, { name: flow.name, qname: null })));
			});
		}
		var extracts = [];
		targets.forEach(function (target) {
			if (extracts.length >= limit) {
				return;
			}
			flowCodeRgExtract(target.code, matcher, context, limit - extracts.length).forEach(function (extract) {
				extracts.push(Object.assign({
					qname: target.qname,
					name: target.name,
					revision: target.revision
				}, extract));
			});
		});
		return {
			ok: true,
			qname: request.qname ? String(request.qname) : null,
			revision: targets.length === 1 ? targets[0].revision : null,
			extracts: extracts
		};
	}

	function blockCodeRgTargets(blocks, request) {
		request = request || {};
		var targetName = String(request.name || request.block || "").trim();
		if (targetName) {
			var target = getBlockSource(blocks, targetName, Object.assign({}, request, { detail: "full" }));
			return (target.format === "flowscript" || target.format === "blockjs") && target.code ? [target] : [];
		}
		var origin = String(request.origin || "").trim();
		var provider = String(request.provider || "").trim();
		var namespace = String(request.namespace || "").trim();
		return Object.keys(blocks || {}).sort().map(function (name) {
			var block = blocks[name];
			if (String(block && block.__flowFormat || "") !== "flowscript-block") {
				return null;
			}
			if (origin && String(block.__flowOrigin || "") !== origin) {
				return null;
			}
			if (provider && String(block.__flowProvider || "") !== provider) {
				return null;
			}
			if (namespace && String(name).indexOf(namespace + ".") !== 0) {
				return null;
			}
			return getBlockSource(blocks, name, Object.assign({}, request, { detail: "full" }));
		}).filter(function (target) {
			return target && (target.format === "flowscript" || target.format === "blockjs") && target.code;
		});
	}

	function blockCodeRgRequest(blocks, request) {
		request = request || {};
		var matcher = codeRgMatcher(request, "flow-block-code-rg");
		var context = Math.max(0, Math.min(20, Number(request.context || request.contextLines || 2)));
		var limit = Math.max(1, Math.min(100, Number(request.limit || 20)));
		var targets = blockCodeRgTargets(blocks, request);
		var extracts = [];
		targets.forEach(function (target) {
			if (extracts.length >= limit) {
				return;
			}
			flowCodeRgExtract(target.code, matcher, context, limit - extracts.length).forEach(function (extract) {
				extracts.push(Object.assign({
					name: target.name,
					origin: target.origin,
					revision: target.codeRevision
				}, extract));
			});
		});
		return {
			ok: true,
			name: request.name ? String(request.name) : null,
			revision: targets.length === 1 ? targets[0].codeRevision : null,
			totalTargets: targets.length,
			extracts: extracts
		};
	}

	function flowCodeCompileRequest(blocks, request, fallbackName) {
		request = request || {};
		var code = request.code !== undefined && request.code !== null ? String(request.code)
			: request.flowScript !== undefined && request.flowScript !== null ? String(request.flowScript)
				: "";
		var name = flowCodeNameOptional(request, code, fallbackName);
		var current = null;
		if (code.trim() === "") {
			current = flowCodeCurrentForEdit(blocks, request, name, !flowCodeOfficialMode(request));
			code = current.code;
			name = current.name || name;
		}
		var checked = flowCodeValidate(blocks, request, name, code);
		var revision = current ? current.revision : sha256Hex(normalizeFlowScriptCode(stripFlowScriptMirrorHeader(code)));
		if (checked.error || !checked.validation || !checked.validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: current && current.draft === true,
				revision: revision,
				codeFile: current ? current.codeFile : "",
				error: checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
					"Fix the reported diagnostics and retry.", flowCodeDiagnosticReport(checked.validation.diagnostics, request)),
				warnings: checked.warnings
			};
		}
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			code: code,
			draft: current && current.draft === true,
			codeFile: current ? current.codeFile : "",
			revision: revision,
			modelRevision: flowCodeRevisionForSource(blocks, name, checked.validation.source, request),
			warnings: checked.warnings,
			validation: checked.validation
		};
	}

	function flowCodeCheckRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptCheck");
		if (!compiled.ok) {
			return compiled;
		}
		return flowCodeAddInputReport(flowCodeAddDiagnosticReport({
			ok: true,
			qname: compiled.qname,
			name: compiled.name,
			draft: compiled.draft === true,
			revision: compiled.revision,
			codeFile: compiled.codeFile || "",
			warnings: compiled.warnings || [],
			next: compiled.draft === true
				? "Check passed. Run with flow-code-run without sending code, then save with flow-code-promote."
				: "Check passed."
		}, compiled.validation.diagnostics || [], request), compiled.validation);
	}

	function flowCodeRunRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptRun");
		if (!compiled.ok) {
			return compiled;
		}
		var execution = runFlowRequest(Object.assign({}, request, {
			name: compiled.name,
			flowName: compiled.name,
			qname: compiled.qname,
			flowSource: compiled.validation.source,
			definition: null
		}), blocks);
		execution.qname = compiled.qname;
		execution.name = compiled.name;
		execution.revision = compiled.revision;
		execution.draft = compiled.draft === true;
		flowCodeAddInputReport(execution, compiled.validation);
		if (compiled.warnings && compiled.warnings.length) {
			execution.warnings = compiled.warnings;
		}
		return execution;
	}

	function flowCodeAnalyzeRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptAnalyze");
		if (!compiled.ok) {
			return compiled;
		}
		var analysis = analyzeFlowSource(blocks, compiled.validation.source, request);
		analysis.qname = compiled.qname;
		analysis.name = compiled.name;
		analysis.revision = compiled.revision;
		analysis.draft = compiled.draft === true;
		if (compiled.warnings && compiled.warnings.length) {
			analysis.warnings = compiled.warnings;
		}
		return analysis;
	}

	function flowCodePromoteRequest(blocks, request) {
		request = Object.assign({}, request || {}, { draft: true });
		var name = flowCodeName(request);
		var current = request.code !== undefined && request.code !== null
			? {
				name: name,
				code: normalizeFlowScriptCode(stripFlowScriptMirrorHeader(String(request.code))),
				revision: sha256Hex(normalizeFlowScriptCode(stripFlowScriptMirrorHeader(String(request.code)))),
				codeFile: ""
			}
			: flowCodeDraftRead(name);
		if (!current) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				error: flowCodeError("FLOW_CODE_DRAFT_MISSING",
					"No FlowScript working copy exists for " + name + ".",
					"Create a working copy with flow-code-set before promoting."),
				warnings: []
			};
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_DRAFT_REVISION_MISMATCH",
					"FlowScript working copy changed since it was checked: " + name,
					"Run flow-code-check again and promote with the latest working copy revision."),
				warnings: []
			};
		}
		var checked = flowCodeValidate(blocks, request, name, current.code);
		if (checked.error || !checked.validation || !checked.validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
					"Patch the working copy and retry flow-code-check.", flowCodeDiagnosticReport(checked.validation.diagnostics, request)),
				warnings: checked.warnings
			};
		}
		var saved = setProjectFlow(blocks, name, checked.validation.source, Object.assign({}, request, {
			code: current.code,
			draft: false,
			official: true,
			promote: true,
			mode: "",
			stage: ""
		}));
		var draftCleared = current.draft === true;
		delete memoryDrafts[String(name)];
		return flowCodeAddInputReport({
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			draft: false,
			promoted: true,
			format: "flowscript",
			canonical: true,
			revision: saved && saved.codeRevision ? saved.codeRevision : flowCodeRevisionForSource(blocks, name, checked.validation.source, request),
			draftRevision: current.revision,
			draftCleared: draftCleared,
			file: saved ? saved.file : "",
			codeFile: saved ? saved.codeFile : "",
			warnings: checked.warnings,
			saved: saved
		}, checked.validation);
	}

		return {
			flowCodeName: flowCodeName,
			flowCodeNameFromCode: flowCodeNameFromCode,
			flowCodeNameOptional: flowCodeNameOptional,
			flowCodeQName: flowCodeQName,
			flowCodeDryRun: flowCodeDryRun,
			flowCodeDraftMode: flowCodeDraftMode,
			flowCodeOfficialMode: flowCodeOfficialMode,
			flowCodeMaxDiagnostics: flowCodeMaxDiagnostics,
			flowCodeDiagnostics: flowCodeDiagnostics,
			flowCodeDiagnosticReport: flowCodeDiagnosticReport,
			flowCodeAddDiagnosticReport: flowCodeAddDiagnosticReport,
			flowCodeParseDiagnostics: flowCodeParseDiagnostics,
			flowCodeExceptionDetails: flowCodeExceptionDetails,
			flowCodeError: flowCodeError,
			flowCodeRevisionForSource: flowCodeRevisionForSource,
			flowCodeValidate: flowCodeValidate,
			flowCodeDraftRead: flowCodeDraftRead,
			flowCodeCurrentForEdit: flowCodeCurrentForEdit,
			flowCodeGetRequest: flowCodeGetRequest,
			flowCodeOfficialRead: flowCodeOfficialRead,
			flowCodeStatusRequest: flowCodeStatusRequest,
			flowCodeDiscardRequest: flowCodeDiscardRequest,
			flowCodeDraftSetRequest: flowCodeDraftSetRequest,
			flowCodeSetRequest: flowCodeSetRequest,
			flowCodePatchRequest: flowCodePatchRequest,
			blockCodePatchRequest: blockCodePatchRequest,
			blockCodeGetRequest: blockCodeGetRequest,
			flowCodeRgExtract: flowCodeRgExtract,
			codeRgMatcher: codeRgMatcher,
			flowCodeRgMatcher: flowCodeRgMatcher,
			flowCodeRgRequest: flowCodeRgRequest,
			blockCodeRgTargets: blockCodeRgTargets,
			blockCodeRgRequest: blockCodeRgRequest,
			flowCodeCompileRequest: flowCodeCompileRequest,
			flowCodeCheckRequest: flowCodeCheckRequest,
			flowCodeRunRequest: flowCodeRunRequest,
			flowCodeAnalyzeRequest: flowCodeAnalyzeRequest,
			flowCodePromoteRequest: flowCodePromoteRequest
		};
	}

	return {
		flowCodeName: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeName.apply(null, args);
		},
		flowCodeNameFromCode: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeNameFromCode.apply(null, args);
		},
		flowCodeNameOptional: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeNameOptional.apply(null, args);
		},
		flowCodeQName: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeQName.apply(null, args);
		},
		flowCodeDryRun: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDryRun.apply(null, args);
		},
		flowCodeDraftMode: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDraftMode.apply(null, args);
		},
		flowCodeOfficialMode: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeOfficialMode.apply(null, args);
		},
		flowCodeMaxDiagnostics: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeMaxDiagnostics.apply(null, args);
		},
		flowCodeDiagnostics: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDiagnostics.apply(null, args);
		},
		flowCodeDiagnosticReport: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDiagnosticReport.apply(null, args);
		},
		flowCodeAddDiagnosticReport: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeAddDiagnosticReport.apply(null, args);
		},
		flowCodeParseDiagnostics: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeParseDiagnostics.apply(null, args);
		},
		flowCodeExceptionDetails: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeExceptionDetails.apply(null, args);
		},
		flowCodeError: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeError.apply(null, args);
		},
		flowCodeRevisionForSource: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeRevisionForSource.apply(null, args);
		},
		flowCodeValidate: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeValidate.apply(null, args);
		},
		flowCodeDraftRead: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDraftRead.apply(null, args);
		},
		flowCodeCurrentForEdit: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeCurrentForEdit.apply(null, args);
		},
		flowCodeGetRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeGetRequest.apply(null, args);
		},
		flowCodeOfficialRead: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeOfficialRead.apply(null, args);
		},
		flowCodeStatusRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeStatusRequest.apply(null, args);
		},
		flowCodeDiscardRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDiscardRequest.apply(null, args);
		},
		flowCodeDraftSetRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeDraftSetRequest.apply(null, args);
		},
		flowCodeSetRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeSetRequest.apply(null, args);
		},
		flowCodePatchRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodePatchRequest.apply(null, args);
		},
		blockCodePatchRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).blockCodePatchRequest.apply(null, args);
		},
		blockCodeGetRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).blockCodeGetRequest.apply(null, args);
		},
		flowCodeRgExtract: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeRgExtract.apply(null, args);
		},
		codeRgMatcher: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).codeRgMatcher.apply(null, args);
		},
		flowCodeRgMatcher: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeRgMatcher.apply(null, args);
		},
		flowCodeRgRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeRgRequest.apply(null, args);
		},
		blockCodeRgTargets: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).blockCodeRgTargets.apply(null, args);
		},
		blockCodeRgRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).blockCodeRgRequest.apply(null, args);
		},
		flowCodeCompileRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeCompileRequest.apply(null, args);
		},
		flowCodeCheckRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeCheckRequest.apply(null, args);
		},
		flowCodeRunRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeRunRequest.apply(null, args);
		},
		flowCodeAnalyzeRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodeAnalyzeRequest.apply(null, args);
		},
		flowCodePromoteRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).flowCodePromoteRequest.apply(null, args);
		}
	};
}())
