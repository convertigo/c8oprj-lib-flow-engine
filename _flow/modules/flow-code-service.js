(function () {
	var localMemoryDrafts = {};
	function memoryDrafts() {
		if (typeof __flowExecutionState === "undefined") return localMemoryDrafts;
		return __flowExecutionState.memoryDrafts || (__flowExecutionState.memoryDrafts = {});
	}

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
		var writeLoadedFlowSourceDraft = env.writeLoadedFlowSourceDraft;
		var readLoadedFlowSourceDraft = env.readLoadedFlowSourceDraft;
		var discardLoadedFlowSourceDraft = env.discardLoadedFlowSourceDraft;
		var projectFlowBean = env.projectFlowBean;
		var projectFlowBeanLookup = env.projectFlowBeanLookup;
		var flowScriptReadRequest = env.flowScriptReadRequest;
		var normalizeFlowScriptCode = env.normalizeFlowScriptCode;
		var stripFlowScriptMirrorHeader = env.stripFlowScriptMirrorHeader;
		var setProjectFlow = env.setProjectFlow;
		var syncProjectFlowInputs = env.syncProjectFlowInputs;
		var applyUnifiedPatchText = env.applyUnifiedPatchText;
		var getBlockSource = env.getBlockSource;
		var setProjectBlockCode = env.setProjectBlockCode;
		var flowScriptBlockCandidates = env.flowScriptBlockCandidates || function () { return []; };
		var flowScriptBlockCandidateDecision = env.flowScriptBlockCandidateDecision || function (candidates) {
			candidates = candidates || [];
			return {
				recommendation: candidates.length && candidates[0].score >= 140 ? "existing" : "mock",
				tool: candidates.length && candidates[0].score >= 140 ? "flow-block-get" : "flow-block-mock",
				bestBlock: candidates.length ? candidates[0].block : "",
				bestScore: candidates.length ? Number(candidates[0].score || 0) : 0,
				preferExistingScore: 140
			};
		};
		var listProjectFlows = env.listProjectFlows;
		var runFlowRequest = env.runFlowRequest;
		var analyzeFlowSource = env.analyzeFlowSource;
		// A check of the same code against the same revisions answers again (Engine.js flowCodeValidationMemo).
		var flowCodeValidationMemo = env.flowCodeValidationMemo || function (blocks, request, name, code, build) { return build(); };
		var parseSource = env.parseSource;
		var normalizeTree = env.normalizeTree || function (value) { return value; };
		var flowScriptIntuitiveResolve = env.flowScriptIntuitiveResolve || null;
		var flowScriptIntuitiveApply = env.flowScriptIntuitiveApply || null;

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
			["severity", "phase", "code", "line", "message", "block", "property", "path", "expression", "actual", "expected", "candidates", "candidateDecision", "next", "create", "mock", "hint"].forEach(function (key) {
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

	function flowCodeInputVariablesFrom(definition) {
		return env.inputVariablesFromDefinition ? env.inputVariablesFromDefinition(definition) : [];
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
		var inputVariables = (validation && validation.inputVariables || []).slice();
		var metadata = flowCodeFlowMetaFrom(definition);
		if (metadata.authenticatedContextRequired !== undefined) out.flowMetadata = { authenticatedContextRequired: metadata.authenticatedContextRequired };
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

	function flowCodeSyncInputs(name, validation, request) {
		if (!syncProjectFlowInputs || !validation || !validation.definition) {
			return null;
		}
		var inputDefinitions = flowCodeInputDefinitionsFrom(validation.definition);
		var metadata = flowCodeFlowMetaFrom(validation.definition);
		if (!Object.keys(inputDefinitions).length && metadata.authenticatedContextRequired === undefined) return null;
		return syncProjectFlowInputs(name, inputDefinitions, Object.assign({}, request || {}, {flowMetadata:metadata}));
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
			// Early parser/correction errors keep the same bounded diagnostic surface
			// as validation errors; MCP consumers can inspect scored mock guidance.
			if (Array.isArray(details.diagnostics)) out.diagnostics = details.diagnostics;
		}
		return out;
	}

	// The first error and its line in the message (env.validationFailureMessage), for a client showing the message only.
	function validationFailedMessage(diagnostics) {
		return env.validationFailureMessage ? env.validationFailureMessage("FlowScript validation failed", diagnostics)
			: "FlowScript validation failed.";
	}

	function flowCodeRevisionForSource(blocks, name, source, request) {
		var code = renderFlowScript(blocks, name, source, Object.assign({}, request || {}, { includeHeader: false }));
		return sha256Hex(code);
	}

	function flowCodeCorrect(blocks, request, code) {
		try {
			return env.flowScriptCorrectSource ? env.flowScriptCorrectSource(blocks, code, request) : { code: code, fixes: [] };
		} catch (error) {
			return { code: code, fixes: [], error: flowCodeError(String(error.code || "FLOWSCRIPT_PARSE_FAILED"),
				String(error.message || error), error.hint || "Fix the source and retry.", flowCodeExceptionDetails(error, request)) };
		}
	}

	function flowCodeCorrections(out, corrected) {
		if (corrected.fixes && corrected.fixes.length) {
			out.fixes = corrected.fixes;
			out.code = corrected.code;
			out.warnings = (out.warnings || []).concat(corrected.fixes.map(function (fix) {
				return { severity: "warning", code: fix.code, line: fix.line, message: "Automatic correction applied; inspect fixes and the returned source." };
			}));
		}
		return out;
	}

	function flowCodeAutoCorrectRequested(request) {
		return !!request && (request.autoCorrect === true || String(request.autoCorrect || "").toLowerCase() === "true");
	}

	// autoCorrect: the edits of the intuitive-call resolver whose confidence reaches the threshold, applied before the
	// safe corrections and the check; null when not asked
	function flowCodeAutoCorrect(blocks, request, code) {
		return null;
	}

	// The edits left for the code the agent patches next (the working copy written, or the code checked), ready to
	// pass unchanged to code-patch with revision; null when the resolver has nothing to say
	function flowCodeProposal(blocks, request, code, revision) {
		if (!flowScriptIntuitiveResolve) {
			return null;
		}
		try {
			var resolution = flowScriptIntuitiveResolve(blocks, code, request);
			if (!resolution.edits.length && env.flowScriptSuggestSource) {
				try {
					var suggestion = env.flowScriptSuggestSource(blocks,code,request);
					if (suggestion.code !== code) resolution.edits.push({line:1,oldText:code,newText:suggestion.code,confidence:1,
						reason:"Suggested explicit form; review the changes before applying.",corrections:suggestion.fixes});
				} catch (_noSafeSuggestion) {}
			}
			if (!resolution.edits.length && !resolution.unresolved.length) return null;
			var confident = resolution.edits.filter(function (edit) { return edit.confidence >= resolution.threshold; }).length;
			var out = { revision: revision || null, threshold: resolution.threshold, edits: resolution.edits.map(function (edit) {
				return Object.assign({}, edit, {before:edit.oldText, after:edit.newText});
			}) };
			if (resolution.unresolved.length) {
				out.unresolved = resolution.unresolved;
			}
			out.next = !resolution.edits.length
				? "No mapping for the unresolved calls: write them with blocks or expressions (flow-block-get, authoring-palette)."
				: revision
					? "Review the edits, then pass them unchanged as code-patch edits with this revision" +
						
						"; drop an edit whose reason does not match the intent."
					: "Apply the edits to code, then send code-set again.";
			return out;
		} catch (e) {
			return null;
		}
	}

	function flowCodeIntuitiveReport(out, auto, proposal, code) {
		if (auto && auto.edits.length) {
			out.autoCorrected = { threshold: auto.threshold, edits: auto.edits };
			out.code = code;
		}
		if (proposal) {
			out.proposedPatch = proposal;
		}
		return out;
	}

	function flowCodeValidate(blocks, request, name, code) {
		request = Object.assign({},request,{nameSession:name});
		try {
			var validation = flowCodeValidationMemo(blocks, request, name, code, function () {
				return flowScriptValidateRequest(blocks, Object.assign({}, request, {
					name: name,
					code: code
				}));
			});
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

	function flowBeanExists(name, request) {
		try {
			var lookup = projectFlowBeanLookup ? projectFlowBeanLookup(name, request) : projectFlowBean ? projectFlowBean(name, request) : null;
			var flow = lookup && lookup.flow !== undefined ? lookup.flow : lookup;
			return !!flow;
		} catch (e) {
			return false;
		}
	}

	function flowCodeDraftKey(request, name) {
		return flowCodeQName(request || {}, name);
	}

	function flowCodeDraftRead(name, request) {
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
		// Without a loaded Flow object, the project's FlowEngine keeps the working copy of the Flow source file.
		var shared = readLoadedFlowSourceDraft && !flowBeanExists(name, request) ? readLoadedFlowSourceDraft(name, request) : null;
		if (shared) {
			return {
				ok: true,
				name: String(name),
				format: "flowscript",
				canonical: false,
				draft: true,
				file: shared.file,
				codeFile: shared.codeFile,
				revision: shared.revision,
				code: shared.code
			};
		}
		var draftKey = flowCodeDraftKey(request, name);
		var draft = memoryDrafts()[draftKey];
		if (!draft) {
			return null;
		}
		// A loaded Flow owns its working copy: without one, the Studio saved,
		// reloaded or discarded it, and the mirror must not bring it back.
		if (flowBeanExists(name, request)) {
			delete memoryDrafts()[draftKey];
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
		var draft = preferDraft ? flowCodeDraftRead(name, request) : null;
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
		if (true) {
			var draft = flowCodeDraftRead(name, request);
			if (draft) {
				draft.qname = flowCodeQName(request, name);
				draft.next = "Working copy loaded. Check with flow-code-check, run with flow-code-run, then save with flow-code-promote.";
				return draft;
			}
		}
		var current = flowScriptReadRequest(blocks, Object.assign({}, request, { name: name, includeHeader: false }));
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
		var draft = flowCodeDraftRead(name, request);
		var official = flowCodeOfficialRead(blocks, request, name);
		var dirty = draft !== null && (!official || draft.revision !== official.revision);
		var status = {
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
		if (projectFlowBean || projectFlowBeanLookup) {
			status.dboStatusAvailable = true;
			try {
				var lookup = projectFlowBeanLookup ? projectFlowBeanLookup(name, request) : projectFlowBean(name, request);
				var flow = lookup && lookup.flow !== undefined ? lookup.flow : lookup;
				if (lookup && lookup.reason !== undefined) {
					status.dboStatusReason = String(lookup.reason || "");
					status.dboStatusProject = String(lookup.projectName || "");
					status.dboStatusFlow = String(lookup.flowName || "");
				}
				if (flow) {
					status.dboHasChanged = flow.hasChanged === true;
					status.dboBNew = flow.bNew === true;
					status.dboFlowSourceDirty = flow.isFlowSourceDirty && flow.isFlowSourceDirty() === true;
					status.dboVariableCount = flow.numberOfVariables ? Number(flow.numberOfVariables()) : -1;
				}
			} catch (e) {
				status.dboStatusError = String(e && e.message || e);
			}
		} else {
			status.dboStatusAvailable = false;
		}
		return status;
	}

	function flowCodeDiscardRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var memoryDiscarded = discardProjectFlowWorkingCopy ? discardProjectFlowWorkingCopy(name) : false;
		if (!memoryDiscarded && discardLoadedFlowSourceDraft && !flowBeanExists(name, request)) {
			memoryDiscarded = discardLoadedFlowSourceDraft(name, request);
		}
		var draftKey = flowCodeDraftKey(request, name);
		var discarded = memoryDrafts()[draftKey] !== undefined;
		delete memoryDrafts()[draftKey];
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
		var submitted = String(code);
		var auto = flowCodeAutoCorrect(blocks, request, submitted);
		var corrected = flowCodeCorrect(blocks, request, auto ? auto.code : submitted);
		var normalized = corrected.code;
		if (current && normalized === current.code) {
			var sameCheck = corrected.error ? {error: corrected.error, validation: null, warnings: []} : flowCodeValidate(blocks, Object.assign({}, request, {authoringCorrections:true}), name, normalized);
			var sameError = sameCheck.error || (sameCheck.validation && sameCheck.validation.ok !== true
				? flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", validationFailedMessage(sameCheck.validation.diagnostics),
					"Patch the working copy and retry code-check.", flowCodeDiagnosticReport(sameCheck.validation.diagnostics, request)) : null);
			var unchanged = {
				ok: sameCheck.error === null && sameCheck.validation && sameCheck.validation.ok === true,
				qname: flowCodeQName(request, name), name: name, unchanged: true, written: false,
				// without a working copy, the submitted source is the saved one
				draft: current.draft === true, workingCopy: current.draft === true, canonical: current.draft !== true,
				revision: current.revision, oldRevision: current.revision,
				warnings: sameCheck.warnings, error: sameError || undefined,
				next: current.draft === true ? "Source unchanged; the existing working copy still needs run/promote." : "Source unchanged; the saved Flow is active."
			};
			flowCodeAddInputReport(unchanged, sameCheck.validation);
			if (unchanged.ok) flowCodeAddDiagnosticReport(unchanged, sameCheck.validation.diagnostics || [], request);
			return flowCodeIntuitiveReport(flowCodeCorrections(unchanged, corrected), auto, null, normalized);
		}
		var written = writeProjectFlowWorkingCode ? writeProjectFlowWorkingCode(name, normalized, request) : null;
		// No loaded Flow owns a new (or file only) Flow yet: the project's FlowEngine keeps its working copy, for
		// every runtime and the Studio. The mirror only serves a standalone runtime, without a loaded project; and
		// flowCodeDraftRead drops it once a Flow exists.
		var shared = !written && writeLoadedFlowSourceDraft ? writeLoadedFlowSourceDraft(name, normalized, request) : null;
		var draftKey = flowCodeDraftKey(request, name);
		if (shared) {
			written = shared;
			delete memoryDrafts()[draftKey];
		} else {
			memoryDrafts()[draftKey] = {
				code: normalized,
				revision: written && written.revision ? written.revision : sha256Hex(normalized),
				file: written && written.file || "",
				codeFile: written && (written.codeFile || written.file) || ""
			};
		}
		var revision = written && written.revision ? written.revision : memoryDrafts()[draftKey].revision;
		// A loaded Flow drops its draft when the submitted source equals the saved source. Do not announce a
		// working copy that the next request cannot read or promote, nor keep a misleading memory mirror.
		var unchangedSaved = !!(written && written.draft === false);
		if (unchangedSaved) delete memoryDrafts()[draftKey];
		var checked = corrected.error ? { error: corrected.error, validation: null, warnings: [] } : flowCodeValidate(blocks, Object.assign({}, request, { authoringCorrections: true }), name, normalized);
		var out = {
			ok: checked.error === null && checked.validation && checked.validation.ok === true,
			qname: flowCodeQName(request, name),
			name: name,
			draft: !unchangedSaved,
			written: !unchangedSaved,
			format: "flowscript",
			canonical: unchangedSaved,
			file: written && written.file ? written.file : "",
			codeFile: written && written.codeFile ? written.codeFile : "",
			revision: revision,
			oldRevision: current ? current.revision : null,
			warnings: checked.warnings
		};
		flowCodeAddInputReport(out, checked.validation);
		if (out.ok) {
			flowCodeAddDiagnosticReport(out, checked.validation.diagnostics || [], request);
			out.next = unchangedSaved ? "Source already saved; no working copy to promote."
				: "Working copy check passed. Run with flow-code-run without sending code, then save with flow-code-promote.";
		} else {
			out.error = checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", validationFailedMessage(checked.validation.diagnostics),
				"Patch the working copy and retry flow-code-check.", flowCodeDiagnosticReport(checked.validation.diagnostics, request));
		}
		return flowCodeIntuitiveReport(flowCodeCorrections(out, corrected), auto,
			!out.ok || auto ? flowCodeProposal(blocks, request, normalized, revision) : null, normalized);
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
		var auto = flowCodeAutoCorrect(blocks, request, code);
		var corrected = flowCodeCorrect(blocks, request, auto ? auto.code : code);
		if (corrected.error) {
			// nothing is written: the edits apply to the code checked, sent again with code-set
			var refusedProposal = flowCodeProposal(blocks, request, corrected.code, null);
			return flowCodeIntuitiveReport(Object.assign({ ok: false, name: name, error: corrected.error, warnings: [] },
				refusedProposal ? { code: corrected.code } : {}), auto, refusedProposal, corrected.code);
		}
		code = corrected.code;
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, { name: name, code: code, authoringCorrections: true }));
		var warnings = flowCodeDiagnostics(validation.diagnostics, "warning");
		if (!validation.ok) {
			var proposal = flowCodeProposal(blocks, request, code, null);
			return flowCodeIntuitiveReport(Object.assign({
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				revision: current ? current.revision : null,
				error: flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", validationFailedMessage(validation.diagnostics),
					"Fix the reported diagnostics and retry.", flowCodeDiagnosticReport(validation.diagnostics, request)),
				warnings: warnings
			}, proposal ? { code: code } : {}), auto, proposal, code);
		}
		var saved = null;
		if (!flowCodeDryRun(request)) {
			saved = setProjectFlow(blocks, name, validation.source, request);
		}
		var revision = saved && saved.codeRevision
			? saved.codeRevision
			: flowCodeRevisionForSource(blocks, name, validation.source, request);
		var inputSync = flowCodeSyncInputs(name, validation, request);
		return flowCodeIntuitiveReport(flowCodeCorrections(flowCodeAddInputReport({
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
			inputSync: inputSync,
			warnings: warnings
		}, validation), corrected), auto, auto ? flowCodeProposal(blocks, request, code, revision) : null, code);
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
		if (!expectedRevision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_REVISION_REQUIRED",
					"Promoting a FlowScript working copy requires the revision that was checked: " + name,
					"Promote with the revision returned by code-set, code-patch or code-check."),
				warnings: []
			};
		}
		if (String(expectedRevision) !== current.revision) {
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
		var applied = request.code !== undefined && request.code !== null ? null : env.applyRequestPatch ? env.applyRequestPatch(current.code, request)
			: applyUnifiedPatchText(current.code, request.codepatch || request.patch || request.unifiedDiff || request.diff || "");
		var code = applied ? applied.content : String(request.code);
		if (!flowCodeOfficialMode(request)) {
			return withPatchReport(flowCodeDraftSetRequest(blocks, Object.assign({}, request, {
				name: name,
				qname: flowCodeQName(request, name),
				revision: current.revision
			}), name, code), applied);
		}
		return withPatchReport(flowCodeSetRequest(blocks, Object.assign({}, request, {
			name: name,
			qname: flowCodeQName(request, name),
			code: code,
			revision: current.revision
		})), applied);
	}

	// Where each hunk of a patch applied, and a warning for each one placed away from its line numbers or read with
	// some tolerance (trailing spaces, empty context lines without their space).
	function withPatchReport(out, applied) {
		if (!applied || !out || typeof out !== "object") {
			return out;
		}
		out.appliedHunks = applied.appliedHunks;
		if (applied.notes && applied.notes.length) {
			out.warnings = (out.warnings || []).concat(applied.notes.map(function (note) {
				return { severity: "warning", code: "PATCH_APPLIED_WITH_TOLERANCE", message: note };
			}));
		}
		return out;
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
		var applied = request.code !== undefined && request.code !== null ? null : env.applyRequestPatch ? env.applyRequestPatch(current.code, request)
			: applyUnifiedPatchText(current.code, request.codepatch || request.patch || request.unifiedDiff || request.diff || "");
		var code = applied ? applied.content : String(request.code);
		var write = setProjectBlockCode(blocks, name, Object.assign({}, request, {
			name: name,
			code: code,
			revision: current.codeRevision
		}));
		return withPatchReport(Object.assign({}, write, {
			oldRevision: current.codeRevision
		}), applied);
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
			var decision = flowScriptBlockCandidateDecision(candidates);
			var preferExisting = decision.recommendation === "existing";
			var exactCandidate = candidates.filter(function (candidate) {
				return String(candidate.block || "") === name;
			})[0];
			var create = {
				tool: decision.tool,
				name: name,
				block: preferExisting ? decision.bestBlock : name
			};
			if (preferExisting) {
				create.alternativeTool = "flow-block-mock";
			} else if (candidates.length) {
				create.candidateTool = "flow-block-get";
				create.candidateBlock = decision.bestBlock;
			}
			return {
				ok: false,
				name: name,
				error: flowCodeError("UNKNOWN_BLOCK", "Unknown Flow block: " + name,
					preferExisting
						? "Best candidate " + decision.bestBlock + " scored " + decision.bestScore + " (threshold " + decision.preferExistingScore + "). Use it only if it matches the intent."
						: (candidates.length
							? "Best candidate " + decision.bestBlock + " scored " + decision.bestScore + " below threshold " + decision.preferExistingScore + ". For intentional domain vocabulary, create an explicit mock with flow-block-mock and typed properties/outputs."
							: "No matching block exists. For intentional domain vocabulary, create an explicit mock with flow-block-mock and typed properties/outputs; otherwise use flow-catalog once.")),
				candidates: candidates,
				candidateDecision: decision,
				create: create,
				next: exactCandidate
					? "Use " + exactCandidate.block + "."
					: (preferExisting
						? "Inspect " + decision.bestBlock + " with flow-block-get. If it is not the intended concept, create " + name + " with flow-block-mock."
						: "Use flow-block-mock for a top-down placeholder, then implement the generated project block with real FlowScript."),
				warnings: []
			};
		}
		var block = getBlockSource(blocks, name, Object.assign({}, request, {
			detail: "full",
			includeMeta: true
		}));
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
		var targetRequests = request.qname || request.name || request.flowName ? [request]
			: listProjectFlows().flows.map(function (flow) {
				return Object.assign({}, request, { name: flow.name, qname: null });
			});
		var extracts = [], singleRevision = null;
		for (var i = 0; i < targetRequests.length && extracts.length < limit; i++) {
			var target = flowCodeGetRequest(blocks, targetRequests[i]);
			if (targetRequests.length === 1) singleRevision = target.revision;
			flowCodeRgExtract(target.code, matcher, context, limit - extracts.length).forEach(function (extract) {
				extracts.push(Object.assign({
					qname: target.qname,
					name: target.name,
					revision: target.revision
				}, extract));
			});
		}
		return {
			ok: true,
			qname: request.qname ? String(request.qname) : null,
			revision: singleRevision,
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
		// Without a filter, the blocks of the project itself; origin:"all" also searches the referenced libraries.
		if (!origin && !provider && !namespace) {
			origin = "project";
		}
		return Object.keys(blocks || {}).sort().map(function (name) {
			var block = blocks[name];
			if (String(block && block.__flowFormat || "") !== "flowscript-block") {
				return null;
			}
			if (origin && origin !== "all" && String(block.__flowOrigin || "") !== origin) {
				return null;
			}
			if (provider && String(block.__flowProvider || "") !== provider) {
				return null;
			}
			if (namespace && String(name).indexOf(namespace + ".") !== 0) {
				return null;
			}
			try {
				return getBlockSource(blocks, name, Object.assign({}, request, { detail: "full" }));
			} catch (e) {
				// a block of another library that does not validate here does not fail the search
				return null;
			}
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
			// the edits of a working copy read here apply to it with its revision
			return flowCodeIntuitiveReport({
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: current && current.draft === true,
				revision: revision,
				codeFile: current ? current.codeFile : "",
				error: checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", validationFailedMessage(checked.validation.diagnostics),
					"Fix the reported diagnostics and retry.", flowCodeDiagnosticReport(checked.validation.diagnostics, request)),
				warnings: checked.warnings
			}, null, flowCodeProposal(blocks, request, code, current ? revision : null), code);
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
			flowQName: compiled.qname,
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
			// the warnings of the source, then those of the run
			execution.warnings = compiled.warnings.concat(execution.warnings || []);
		}
		return execution;
	}

	function flowCodeAnalyzeRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptAnalyze");
		if (!compiled.ok) {
			return compiled;
		}
		var analysis = analyzeFlowSource(blocks, compiled.validation.source, Object.assign({}, request, {flowQName: compiled.qname}));
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
				code: String(request.code),
				revision: sha256Hex(String(request.code)),
				codeFile: ""
			}
			: flowCodeDraftRead(name, request);
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
		var suppliedCode = request.code !== undefined && request.code !== null;
		var selectedRevision = !expectedRevision && !suppliedCode;
		if (selectedRevision) expectedRevision = current.revision;
		if (!expectedRevision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_REVISION_REQUIRED",
					"Promoting a FlowScript working copy requires the revision that was checked: " + name,
					"Promote with the revision returned by code-set, code-patch or code-check."),
				warnings: []
			};
		}
		if (String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_DRAFT_REVISION_MISMATCH",
					"Supplied revision " + String(expectedRevision) + " is not the current working copy revision " + current.revision + " for " + name + ".",
					"Copy the revision returned by code-get or code-check exactly, then promote that checked revision. A mismatch alone does not establish that the working copy changed.",
					{property:"revision",receivedRevision:String(expectedRevision),currentRevision:current.revision,name:name}),
				warnings: []
			};
		}
		var corrected = flowCodeCorrect(blocks, request, current.code);
		var checked = corrected.error ? { error: corrected.error, validation: null, warnings: [] } : flowCodeValidate(blocks, Object.assign({}, request, { authoringCorrections: true }), name, corrected.code);
		if (checked.error || !checked.validation || !checked.validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", validationFailedMessage(checked.validation.diagnostics),
					"Patch the working copy and retry flow-code-check.", flowCodeDiagnosticReport(checked.validation.diagnostics, request)),
				warnings: checked.warnings
			};
		}
		if (!suppliedCode) {
			var latest = flowCodeDraftRead(name, request);
			if (!latest || latest.revision !== current.revision) return {
				ok: false, name: name, revision: latest ? latest.revision : "", draft: true,
				error: flowCodeError("FLOW_CODE_DRAFT_REVISION_MISMATCH", "Working copy changed during validation.", "Read/check the current revision before promoting."), warnings: []
			};
		}
		var formatted = renderFlowScript(blocks, name, checked.validation.source, {includeHeader:false, includeImplicitReturn:false});
		var after = {validation:flowScriptValidateRequest(blocks,Object.assign({},request,{name:name,code:formatted}))};
		function comparable(source) {
			function clean(value) {
				if (Array.isArray(value)) return value.map(clean);
				if (!value || typeof value !== "object") return value;
				var out = {};
				Object.keys(value).sort().forEach(function (key) {
					if (key !== "__flowImplicitId" && key.indexOf("__flowScript") !== 0) Object.defineProperty(out,key,{value:clean(value[key]),enumerable:true});
				});
				return out;
			}
			return JSON.stringify(clean(parseSource(source)));
		}
		if (after.error || !after.validation || !after.validation.ok || comparable(checked.validation.source) !== comparable(after.validation.source)) {
			return {ok:false,name:name,revision:current.revision,error:flowCodeError("FLOWSCRIPT_FORMAT_CHANGED_PROGRAM",
				"Formatting changed the Flow tree; nothing was saved.","Keep the draft and report the formatter defect."),warnings:[]};
		}
		var beforeLines = current.code.split("\n"), afterLines = formatted.split("\n");
		var prefix = 0, suffix = 0;
		while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix++;
		while (suffix < beforeLines.length-prefix && suffix < afterLines.length-prefix && beforeLines[beforeLines.length-1-suffix] === afterLines[afterLines.length-1-suffix]) suffix++;
		var changedLines = Math.max(beforeLines.length-prefix-suffix, afterLines.length-prefix-suffix);
		var saved = setProjectFlow(blocks, name, checked.validation.source, Object.assign({}, request, {
			code: formatted,
			draft: false,
			official: true,
			promote: true,
			mode: "",
			stage: ""
		}));
		var inputSync = flowCodeSyncInputs(name, checked.validation, request);
		var draftCleared = current.draft === true;
		delete memoryDrafts()[flowCodeDraftKey(request, name)];
		// The saved file replaces the working copy kept by the FlowEngine for a Flow without a Flow object.
		if (discardLoadedFlowSourceDraft) {
			discardLoadedFlowSourceDraft(name, request);
		}
		return flowCodeCorrections(flowCodeAddInputReport({
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			draft: false,
			promoted: true,
			linted: formatted !== current.code,
			changedLines: changedLines,
			format: "flowscript",
			canonical: true,
			revision: saved && saved.codeRevision ? saved.codeRevision : flowCodeRevisionForSource(blocks, name, checked.validation.source, request),
			draftRevision: current.revision,
			draftCleared: draftCleared,
			file: saved ? saved.file : "",
			codeFile: saved ? saved.codeFile : "",
			inputSync: inputSync,
			warnings: checked.warnings,
			saved: saved
		}, checked.validation), corrected);
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
