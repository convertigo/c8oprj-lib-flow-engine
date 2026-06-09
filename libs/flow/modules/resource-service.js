(function () {
	function projectResourceFile(path, mustExist, env) {
		var base = env.projectDir();
		if (!base) {
			env.raise("PROJECT_RESOURCES_UNAVAILABLE", "Project Flow resources are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		var normalized = env.normalizeResourcePath(path);
		if (!env.isAllowedResourcePath(normalized)) {
			env.raise("RESOURCE_PATH_NOT_ALLOWED", "Flow resource path is not editable through this API: " + normalized,
				null, "Allowed paths: libs/flow/blocks/**/*.block.js, libs/flow/blocks/**/*.hooks.js, libs/flow/lib/**/*.js, libs/flow/resources/**/*.{md,txt,json,yaml,yml}, libs/flow/types/**/*.{type.yaml,js}, libs/flow/types/editors/**/*.{html,css,js}. Legacy block YAML paths are still accepted as fallback.");
		}
		var file = new env.File(base, normalized);
		var basePath = env.canonicalPath(base);
		var filePath = env.canonicalPath(file);
		if (filePath !== basePath && filePath.indexOf(basePath + env.File.separator) !== 0) {
			env.raise("RESOURCE_PATH_NOT_ALLOWED", "Flow resource path escapes the project: " + normalized);
		}
		if (mustExist && !file.isFile()) {
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
		var listed = dir && dir.listFiles();
		if (!listed) {
			return;
		}
		var files = env.Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (file.isDirectory()) {
				collectResourceFiles(file, base, out, env);
				return;
			}
			if (!file.isFile()) {
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
		if (!base || !base.isDirectory()) {
			return [];
		}
		var out = [];
		["libs/flow/blocks", "libs/flow/fragments", "libs/flow/lib", "libs/flow/resources", "libs/flow/types"].forEach(function (path) {
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
		content = content === undefined ? String(env.FileUtils.readFileToString(entry.file, "UTF-8")) : String(content);
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
			var content = String(env.FileUtils.readFileToString(entry.file, "UTF-8"));
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

	function list(request, env) {
		request = request || {};
		var rootDir = String(request.rootDir || request.root || "").trim().replace(/\\/g, "/");
		var patterns = env.globPatterns(request.pattern || request.glob, rootDir ? "**/*" : "libs/flow/resources/**/*");
		if (rootDir) {
			rootDir = env.normalizeResourcePath(rootDir);
			patterns = patterns.map(function (pattern) {
				if (pattern.indexOf("libs/flow/") === 0) {
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
			out.doc = "List project-local Flow resources using glob patterns such as libs/flow/resources/**/*.md.";
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
		var maxFileBytes = env.intOption(request.maxFileBytes, 500000, 1000, 5000000);
		var matches = [];
		projectResourceEntries(env).forEach(function (entry) {
			if (entry.file.length() > maxFileBytes) {
				return;
			}
			var content = String(env.FileUtils.readFileToString(entry.file, "UTF-8"));
			var text = [entry.path, env.resourceKind(entry.path), env.resourceName(entry.path), content].join(" ");
			if (!env.searchMatches(text, needle)) {
				return;
			}
			matches.push(Object.assign(resourceSummary(entry, content, env), {
				snippet: env.searchSnippet(content || entry.path, needle),
				next: "flow-resource-get path=" + entry.path
			}));
		});
		var offset = env.intOption(request.cursor, 0, 0);
		var limit = env.intOption(request.limit, 50, 1, 500);
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
				"Use this for block/fragment/type/editor/library sources. Use flow-search for Flow graph nodes.",
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
		var maxBytes = env.intOption(request.maxBytes, 1000000, 1000, 5000000);
		if (entry.file.length() > maxBytes && request.allowLarge !== true) {
			env.raise("RESOURCE_TOO_LARGE", "Flow resource is too large to return: " + entry.path,
				null, "Pass a higher maxBytes or allowLarge=true if this file is intentionally large.");
		}
		var content = String(env.FileUtils.readFileToString(entry.file, "UTF-8"));
		return Object.assign({ ok: true, content: content }, resourceSummary(entry, content, env));
	}

	function validateResourceContent(path, content, env) {
		var kind = env.resourceKind(path);
		var blockId = env.blockIdFromResourcePath(path);
		if (kind === "block") {
			var descriptorFile = env.projectBlockDescriptorFileForResource(path);
			if (!descriptorFile || !descriptorFile.isFile()) {
				env.raise("BLOCK_DESCRIPTOR_REQUIRED", "Block implementation resources require a peer *.block.yaml descriptor: " + path,
					null, "Create or patch libs/flow/blocks/" + env.blockDescriptorFileName(blockId) + " first.");
			}
			env.validateBlockImplementationSource(blockId, content);
		} else if (kind === "blockFlow") {
			var flowDescriptorFile = env.projectBlockDescriptorFileForResource(path);
			if (!flowDescriptorFile || !flowDescriptorFile.isFile()) {
				env.raise("BLOCK_DESCRIPTOR_REQUIRED", "Flow block implementation resources require a peer *.block.yaml descriptor: " + path,
					null, "Create or patch libs/flow/blocks/" + env.blockDescriptorFileName(blockId) + " first.");
			}
			env.validateBlockFlowImplementationSource(blockId, content);
		} else if (kind === "blockHooks") {
			var hooksContractFile = env.projectBlockContractFileForResource(path);
			if (!hooksContractFile || !hooksContractFile.isFile()) {
				env.raise("BLOCK_DESCRIPTOR_REQUIRED", "Block hooks resources require a peer *.block.js source or legacy *.block.yaml descriptor: " + path,
					null, "Create or patch libs/flow/blocks/" + env.blockCodeDescriptorFileName(blockId) + " first.");
			}
			env.validateBlockHooksSource(blockId, content);
		} else if (kind === "graphBlock") {
			env.validateGraphBlockSource(blockId, content);
		} else if (kind === "graphBlockCode") {
			env.compileProjectBlockCode(env.loadBlocks(), blockId, content);
		} else if (kind === "fragment") {
			env.parseYamlSource(content, "version: 1\nnodes: []\n");
		} else if (kind === "library") {
			var library = eval(String(content || ""));
			if (!library || typeof library !== "object") {
				env.raise("INVALID_LIBRARY", "Invalid Flow library resource: " + path,
					null, "A Flow library must evaluate to an object.");
			}
		} else if (kind === "typeDescriptor") {
			env.validateTypeDescriptorSource(env.resourceName(path), content);
		}
		return {
			ok: true,
			kind: kind
		};
	}

	function patch(request, env) {
		request = request || {};
		var entry = projectResourceFile(request.path, true, env);
		var oldContent = String(env.FileUtils.readFileToString(entry.file, "UTF-8"));
		var oldHash = env.sha256Hex(oldContent);
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
			oldHash: oldHash,
			newHash: newHash,
			changed: oldHash !== newHash,
			validation: validation
		}, request.includeContent === true ? { content: applied.content } : {});
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
		patch: patch
	};
}())
