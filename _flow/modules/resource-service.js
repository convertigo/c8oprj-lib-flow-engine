(function () {
	function sourceForFile(file, env) {
		return env.sources ? env.sources.read(file) : String(env.FileUtils.readFileToString(file, "UTF-8"));
	}
	function isFile(file, env) { return env.sources ? env.sources.isFile(file) : file.isFile(); }
	function isDirectory(file, env) { return env.sources ? env.sources.isDirectory(file) : file.isDirectory(); }
	function projectResourceFile(path, mustExist, env) {
		var base = env.projectDir();
		if (!base) {
			env.raise("PROJECT_RESOURCES_UNAVAILABLE", "Project Flow resources are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		var normalized = env.normalizeResourcePath(path);
		if (!env.isAllowedResourcePath(normalized)) {
			env.raise("RESOURCE_PATH_NOT_ALLOWED", "Flow resource path is not editable through this API: " + normalized,
				null, "Use resource.list to discover editable sources under " + env.sourcePaths.root + ", public resources/ or the Java sources libs/src/ (*.java). Use the flowCode* APIs for Flow sources.");
		}
		var file = new env.File(base, normalized);
		var basePath = env.canonicalPath(base);
		var filePath = env.canonicalPath(file);
		if (filePath !== basePath && filePath.indexOf(basePath + env.File.separator) !== 0) {
			env.raise("RESOURCE_PATH_NOT_ALLOWED", "Flow resource path escapes the project: " + normalized);
		}
		if (mustExist && !isFile(file, env)) {
			env.raise("UNKNOWN_RESOURCE", "Unknown Flow resource: " + normalized);
		}
		return {
			path: normalized,
			file: file
		};
	}

	function resourceRelativePath(base, file, env) {
		var basePath = env.canonicalPath(base);
		var filePath = env.canonicalPath(file);
		if (filePath.indexOf(basePath + env.File.separator) !== 0) {
			return "";
		}
		return filePath.substring(basePath.length + 1).replace(/\\/g, "/");
	}

	function collectResourceFiles(dir, base, out, env) {
		var listed = dir && (env.sources ? env.sources.files(dir) : dir.listFiles());
		if (!listed) {
			return;
		}
		var files = env.sources ? listed : env.Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (isDirectory(file, env)) {
				collectResourceFiles(file, base, out, env);
				return;
			}
			if (!isFile(file, env)) {
				return;
			}
			var path = resourceRelativePath(base, file, env);
			if (path && env.isAllowedResourcePath(path)) {
				out.push({
					path: path,
					file: file
				});
			}
		});
	}

	function projectResourceEntries(env) {
		var base = env.projectDir();
		if (!base || !isDirectory(base, env)) {
			return [];
		}
		var out = [];
		var engineConfig = new env.File(base, env.sourcePaths.path("engine.yaml"));
		if (isFile(engineConfig, env)) {
			out.push({
				path: env.sourcePaths.path("engine.yaml"),
				file: engineConfig
			});
		}
		["blocks", "fragments", "lib", "resources", "frontbuilder", "types"].map(env.sourcePaths.path).concat(["resources", "libs/src"]).forEach(function (path) {
			collectResourceFiles(new env.File(base, path), base, out, env);
		});
		return out;
	}

	function projectResourceEntryForUri(uri, env) {
		var wanted = String(uri || "").trim();
		if (wanted === "") {
			env.raise("MISSING_RESOURCE_URI", "A Flow resource uri is required.");
		}
		var entries = projectResourceEntries(env);
		for (var i = 0; i < entries.length; i++) {
			if (env.resourceUri(entries[i].path) === wanted) {
				return entries[i];
			}
		}
		env.raise("UNKNOWN_RESOURCE", "Unknown Flow resource uri: " + wanted,
			null, wanted.indexOf("flow://guide/") === 0 || wanted.indexOf("flow://skills/") === 0
				? "Use MCP resources/read for Flow MCP guides and skills; use flow-resource-get for project-local source resources."
				: "Use flow-resource-search or flow-resource-list first, then flow-resource-get with the returned path or uri.");
	}

	function resourceSummary(entry, content, env) {
		content = content === undefined ? sourceForFile(entry.file, env) : String(content);
		var summary = {
			path: entry.path,
			kind: env.resourceKind(entry.path),
			name: env.resourceName(entry.path),
			mimeType: env.resourceMimeType(entry.path),
			file: String(entry.file.getAbsolutePath()),
			size: Number(entry.file.length()),
			lastModified: Number(entry.file.lastModified()),
			hash: env.sha256Hex(content)
		};
		var uri = env.resourceUri(entry.path);
		if (uri) {
			summary.uri = uri;
			summary.name = env.firstMarkdownHeading(content, summary.name);
			summary.description = env.firstMarkdownParagraph(content);
		}
		return summary;
	}

	function resourceListSummary(entry, includeHash, env) {
		var summary = {
			path: entry.path,
			kind: env.resourceKind(entry.path),
			name: env.resourceName(entry.path),
			mimeType: env.resourceMimeType(entry.path),
			size: Number(entry.file.length()),
			lastModified: Number(entry.file.lastModified())
		};
		var uri = env.resourceUri(entry.path);
		if (uri) {
			summary.uri = uri;
		}
		if (includeHash === true || uri) {
			var content = sourceForFile(entry.file, env);
			if (includeHash === true) {
				summary.hash = env.sha256Hex(content);
			}
			if (uri) {
				summary.name = env.firstMarkdownHeading(content, summary.name);
				summary.description = env.firstMarkdownParagraph(content);
			}
		}
		return summary;
	}

	function compactSnippet(text, needle, maxChars, env) {
		var snippet = String(env.searchSnippet(text || "", needle) || "");
		maxChars = env.intOption(maxChars, 180, 40, 1000);
		if (snippet.length <= maxChars) {
			return snippet;
		}
		return snippet.substring(0, maxChars - 1) + "…";
	}

	function resourceSearchSummary(entry, content, needle, request, env) {
		var summary = {
			path: entry.path,
			kind: env.resourceKind(entry.path),
			name: env.resourceName(entry.path),
			mimeType: env.resourceMimeType(entry.path),
			size: Number(entry.file.length()),
			snippet: compactSnippet(content || entry.path, needle, request.snippetChars || request.maxSnippetChars, env),
			next: "flow-resource-get path=" + entry.path
		};
		var uri = env.resourceUri(entry.path);
		if (uri) {
			summary.uri = uri;
			summary.name = env.firstMarkdownHeading(content, summary.name);
			summary.description = env.firstMarkdownParagraph(content);
		}
		if (request.includeHash === true) {
			summary.hash = env.sha256Hex(content);
		}
		return summary;
	}

	function list(request, env) {
		request = request || {};
		var rootDir = String(request.rootDir || request.root || "").trim().replace(/\\/g, "/");
		var patterns = env.globPatterns(request.pattern || request.glob, rootDir ? "**/*" : env.sourcePaths.path("resources/**/*"));
		if (rootDir) {
			rootDir = env.normalizeResourcePath(rootDir);
			patterns = patterns.map(function (pattern) {
				if (pattern.indexOf(env.sourcePaths.root + "/") === 0) {
					return pattern;
				}
				return rootDir.replace(/\/+$/, "") + "/" + pattern.replace(/^\/+/, "");
			});
		}
		var kind = String(request.kind || "").trim();
		var query = String(request.query || request.q || "").trim().toLowerCase();
		var resources = [];
		projectResourceEntries(env).forEach(function (entry) {
			if (!env.globMatches(entry.path, patterns)) {
				return;
			}
			if (kind && env.resourceKind(entry.path) !== kind) {
				return;
			}
			var summary = resourceListSummary(entry, request.includeHash === true, env);
			if (query) {
				var haystack = [summary.path, summary.uri, summary.name, summary.description, summary.kind].join(" ").toLowerCase();
				if (haystack.indexOf(query) === -1) {
					return;
				}
			}
			resources.push(summary);
		});
		resources.sort(function (a, b) {
			return String(a.path).localeCompare(String(b.path));
		});
		var offset = request.cursor !== undefined && request.cursor !== null && String(request.cursor) !== ""
			? env.intOption(request.cursor, 0, 0)
			: env.intOption(request.skip || request.offset, 0, 0);
		var limit = env.intOption(request.limit, 100, 1, 500);
		var page = resources.slice(offset, offset + limit);
		var out = {
			ok: true,
			pattern: patterns,
			count: page.length,
			total: resources.length,
			resources: page,
			nextCursor: offset + limit < resources.length ? String(offset + limit) : null
		};
		if (request.doc !== false) {
			out.doc = "List project-local Flow resources using glob patterns such as " + env.sourcePaths.path("resources/**/*.md") + " or libs/src/**/*.java.";
		}
		if (request.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Use resource.get with uri or path to read one listed resource.",
				"Use pattern to stay narrow; repeated calls can also pass doc=false."
			];
		}
		return out;
	}

	function search(request, env) {
		request = request || {};
		var needle = env.searchNeedle(request);
		var maxFileBytes = env.intOption(request.maxFileBytes, 120000, 1000, 5000000);
		var entries = projectResourceEntries(env);
		var signature = {
			service: "resource.search",
			project: String(env.projectDir() || ""),
			revision: env.sha256Hex(JSON.stringify(entries.map(function (entry) {
				return [entry.path, Number(entry.file.length()), Number(entry.file.lastModified())];
			}))),
			query: String(request.query || request.q || ""),
			maxFileBytes: maxFileBytes
		};
		var budget = env.responseBudget(request, { key: env.sha256Hex(JSON.stringify(signature)) });
		if (budget.enabled || String(request.cursor || "").indexOf("rb1.") === 0) {
			var state = budget.cursor({ index: 0 });
			var start = Math.max(0, env.intOption(state.index, 0, 0));
			var limitedMatches = [];
			var limit = env.intOption(request.limit, 10, 1, 50);
			var index = start;
			for (; index < entries.length && limitedMatches.length < limit; index++) {
				var resumeState = { index: index };
				if (!budget.shouldContinue(limitedMatches.length, resumeState, index - start)) {
					break;
				}
				var entry = entries[index];
				if (entry.file.length() > maxFileBytes) {
					continue;
				}
				var content = sourceForFile(entry.file, env);
				var text = [entry.path, env.resourceKind(entry.path), env.resourceName(entry.path), content].join(" ");
				if (!env.searchMatches(text, needle)) {
					continue;
				}
				if (!budget.tryAdd(limitedMatches, resourceSearchSummary(entry, content, needle, request, env), resumeState)) {
					break;
				}
			}
			return budget.finish({
				ok: true,
				query: String(request.query || request.q || ""),
				count: limitedMatches.length,
				total: null,
				resources: limitedMatches,
				nextCursor: null
			}, index < entries.length, { index: index });
		}
		var matches = [];
		entries.forEach(function (entry) {
			if (entry.file.length() > maxFileBytes) {
				return;
			}
			var content = sourceForFile(entry.file, env);
			var text = [entry.path, env.resourceKind(entry.path), env.resourceName(entry.path), content].join(" ");
			if (!env.searchMatches(text, needle)) {
				return;
			}
			matches.push(resourceSearchSummary(entry, content, needle, request, env));
		});
		var offset = env.intOption(request.cursor, 0, 0);
		var limit = env.intOption(request.limit, 10, 1, 50);
		var page = matches.slice(offset, offset + limit);
		var out = {
			ok: true,
			query: String(request.query || request.q || ""),
			count: page.length,
			total: matches.length,
			resources: page,
			nextCursor: offset + limit < matches.length ? String(offset + limit) : null
		};
		if (request.doc !== false) {
			out.doc = "Search project-local Flow text resources. Patch only these whitelisted files through flow-resource-patch.";
		}
		if (request.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Use this for project config, block/fragment/type/editor/library sources. Use flow-search for Flow graph nodes.",
				"Call flow-resource-get before patching; pass its hash as baseHash.",
				"Pass doc=false on repeated calls when the short tool contract is already known."
			];
		}
		return out;
	}

	function get(request, env) {
		request = request || {};
		var entry = request.path !== undefined && request.path !== null && String(request.path).trim() !== ""
			? projectResourceFile(request.path, true, env)
			: projectResourceEntryForUri(request.uri, env);
		var maxBytes = env.intOption(request.maxBytes, 12000, 1000, 5000000);
		var content = sourceForFile(entry.file, env);
		var summary = resourceSummary(entry, content, env);
		var truncated = content.length > maxBytes && request.allowLarge !== true;
		var returned = truncated ? content.substring(0, maxBytes) : content;
		var out = Object.assign({
			ok: true,
			content: returned,
			truncated: truncated,
			contentLength: content.length,
			returnedLength: returned.length
		}, summary);
		if (truncated) {
			out.hint = "Content was truncated. Use a narrower search/code-rg, or pass maxBytes/allowLarge=true only when the full file is required.";
		}
		return out;
	}

	// The server compiles libs/src as a whole and keeps the previous classes when it fails: a source declares the package
	// of its folder, so that a misplaced file is refused here rather than breaking the next compilation. Compiling is the
	// server's job (javac of the engine, with the libraries of the project).
	function validateJavaSource(path, content, env) {
		var code = String(content || "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
		if (code.trim() === "") {
			env.raise("INVALID_JAVA_SOURCE", "Empty Java source: " + path,
				null, "Delete the resource with flow-resource-delete instead of emptying it.");
		}
		var folder = String(path).substring("libs/src/".length);
		folder = folder.lastIndexOf("/") < 0 ? "" : folder.substring(0, folder.lastIndexOf("/")).replace(/\//g, ".");
		var declared = code.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/m);
		var pkg = declared ? declared[1].replace(/\s+/g, "") : "";
		if (pkg !== folder) {
			env.raise("INVALID_JAVA_SOURCE", "Java source " + path + " declares package '" + pkg + "' instead of '" + folder + "'.",
				null, folder ? "Start the source with: package " + folder + ";" : "Sources at the root of libs/src are in the default package: remove the package declaration or move the file.");
		}
	}

	function validateResourceContent(path, content, env) {
		var kind = env.resourceKind(path);
		var blockId = env.blockIdFromResourcePath(path);
		if (kind === "blockHooks") {
			var hooksContractFile = env.projectBlockCodeFileForResource(path);
			if (!hooksContractFile || !hooksContractFile.isFile()) {
				env.raise("BLOCK_DESCRIPTOR_REQUIRED", "Block hooks resources require a peer *.block.js source: " + path,
					null, "Create or patch " + env.sourcePaths.path("blocks/" + env.blockCodeDescriptorFileName(blockId)) + " first.");
			}
			env.validateBlockHooksSource(blockId, content);
		} else if (kind === "graphBlockCode") {
			env.compileProjectBlockCode(env.loadBlocks(), blockId, content);
		} else if (kind === "fragment") {
			env.parseYamlSource(content, "version: 1\nnodes: []\n");
		} else if (kind === "projectConfig") {
			env.parseYamlSource(content, "version: 1\nengineQName: lib_flow_engine.Engine\nbindings: {}\nconfig: {}\n");
		} else if (kind === "frontendBlock" || kind === "frontendModel" && String(path).endsWith(".front.json")) {
			JSON.parse(String(content || "{}"));
		} else if (kind === "frontendModel" && String(path).endsWith(".flow.svelte")) {
			if (String(content || "").indexOf("<script") === -1) {
				env.raise("INVALID_FRONTEND_SOURCE", "Invalid Svelte Flow frontend source: " + path,
					null, "A *.flow.svelte source must remain Svelte-like and carry its metadata in a module script.");
			}
		} else if (kind === "library") {
			var library = env.evalCompiledSource(String(content || ""), "resource:" + path, env.sha256Hex(content));
			if (!library || typeof library !== "object") {
				env.raise("INVALID_LIBRARY", "Invalid Flow library resource: " + path,
					null, "A Flow library must evaluate to an object.");
			}
		} else if (kind === "typeDescriptor") {
			env.validateTypeDescriptorSource(env.resourceName(path), content);
		} else if (kind === "javaSource") {
			validateJavaSource(path, content, env);
		}
		return {
			ok: true,
			kind: kind
		};
	}

	function patch(request, env) {
		request = request || {};
		// A caller holding the working copy of a source (FlowEngine draft) patches that text.
		var fromWorkingCopy = request.baseContent !== undefined && request.baseContent !== null;
		// A Java source is created by a patch from an empty file (--- /dev/null); the other resources have their own
		// creation APIs (blocks, fragments, frontends).
		var entry = projectResourceFile(request.path, false, env);
		var created = !fromWorkingCopy && !isFile(entry.file, env);
		if (created && env.resourceKind(entry.path) !== "javaSource") {
			env.raise("UNKNOWN_RESOURCE", "Unknown Flow resource: " + entry.path);
		}
		var oldContent = fromWorkingCopy ? String(request.baseContent) : created ? "" : sourceForFile(entry.file, env);
		var oldHash = env.sha256Hex(oldContent);
		if (fromWorkingCopy && request.dryRun !== true) {
			env.raise("RESOURCE_WORKING_COPY_WRITE", "A working copy patch is only previewed; its owner stores the result.",
				null, "Pass dryRun:true with baseContent.");
		}
		if (request.baseHash && String(request.baseHash) !== oldHash) {
			env.raise("RESOURCE_BASE_HASH_MISMATCH", "Flow resource changed since it was read: " + entry.path,
				null, "Read the resource again and patch from the new hash.");
		}
		var applied = env.applyUnifiedPatchText(oldContent, request.patch || request.unifiedDiff || request.diff || "");
		var validation = request.validate === false
			? { ok: true, skipped: true }
			: validateResourceContent(entry.path, applied.content, env);
		var newHash = env.sha256Hex(applied.content);
		if (request.dryRun !== true) {
			env.FileUtils.writeStringToFile(entry.file, applied.content, "UTF-8");
		}
		return Object.assign({
			ok: true,
			path: entry.path,
			dryRun: request.dryRun === true,
			hunks: applied.hunks,
			created: created,
			oldHash: oldHash,
			newHash: newHash,
			changed: oldHash !== newHash,
			validation: validation
		}, request.includeContent === true ? { content: applied.content } : {});
	}

	function remove(request, env) {
		request = request || {};
		// A caller holding the working copy of a source (FlowEngine draft) patches that text.
		var fromWorkingCopy = request.baseContent !== undefined && request.baseContent !== null;
		var entry = projectResourceFile(request.path, !fromWorkingCopy, env);
		var oldContent = fromWorkingCopy ? String(request.baseContent) : sourceForFile(entry.file, env);
		var oldHash = env.sha256Hex(oldContent);
		if (fromWorkingCopy && request.dryRun !== true) {
			env.raise("RESOURCE_WORKING_COPY_WRITE", "A working copy patch is only previewed; its owner stores the result.",
				null, "Pass dryRun:true with baseContent.");
		}
		if (request.baseHash && String(request.baseHash) !== oldHash) {
			env.raise("RESOURCE_BASE_HASH_MISMATCH", "Flow resource changed since it was read: " + entry.path,
				null, "Read the resource again and delete from the new hash.");
		}
		var deleted = false;
		if (request.dryRun !== true) {
			deleted = entry.file["delete"]();
			if (!deleted && entry.file.isFile()) {
				env.raise("RESOURCE_DELETE_FAILED", "Unable to delete Flow resource: " + entry.path);
			}
		}
		return {
			ok: true,
			path: entry.path,
			dryRun: request.dryRun === true,
			oldHash: oldHash,
			deleted: request.dryRun === true ? false : deleted
		};
	}

	return {
		projectResourceFile: projectResourceFile,
		projectResourceEntries: projectResourceEntries,
		projectResourceEntryForUri: projectResourceEntryForUri,
		resourceSummary: resourceSummary,
		resourceListSummary: resourceListSummary,
		list: list,
		search: search,
		get: get,
		validateResourceContent: validateResourceContent,
		patch: patch,
		remove: remove
	};
}())
