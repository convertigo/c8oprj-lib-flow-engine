(function () {
	function blockDescriptor(block, env) {
		var descriptor = env.blockCatalog(block);
		descriptor.blockId = descriptor.blockId || block.name;
		descriptor.namespace = env.blockNamespace(descriptor.blockId);
		descriptor.localName = descriptor.localName || env.blockLocalName(descriptor.blockId) || descriptor.blockId;
		descriptor.name = descriptor.localName;
		if (descriptor.origin === undefined) {
			descriptor.origin = block.__flowOrigin || "unknown";
		}
		if (descriptor.provider === undefined) {
			descriptor.provider = block.__flowProvider || descriptor.origin || "unknown";
		}
		if (descriptor.file === undefined) {
			descriptor.file = String(block.__flowFile || "");
		}
		if (descriptor.implementation === undefined) {
			descriptor.implementation = block.__graphDefinition ? "flow" : "javascript";
		}
		if (!descriptor.tags) {
			descriptor.tags = [];
		}
		if (descriptor["private"] === undefined && block["private"] !== undefined) {
			descriptor["private"] = block["private"] === true;
		}
		env.resolveBlockIcon(block, descriptor);
		return descriptor;
	}

	function typeDescriptor(type, env) {
		var descriptor = env.normalizeTree(type || {});
		if (!descriptor.name) {
			descriptor.name = type.name;
		}
		if (descriptor.origin === undefined) {
			descriptor.origin = type.__flowOrigin || "unknown";
		}
		if (descriptor.file === undefined) {
			descriptor.file = String(type.__flowFile || "");
		}
		var baseDir = descriptor.file ? new env.File(descriptor.file).getParentFile() : env.engineDir();
		["editor", "validator", "reader", "writer", "documentation"].forEach(function (key) {
			var resource = descriptor[key];
			if (resource && typeof resource === "object" && resource.file) {
				resource.file = env.resourcePath(baseDir, resource.file);
			}
		});
		return descriptor;
	}

	function compactPropertyDescriptor(property) {
		var out = {};
		["kind", "type", "items", "mode", "default", "description"].forEach(function (key) {
			if (property && property[key] !== undefined && property[key] !== null && property[key] !== "") {
				out[key] = property[key];
			}
		});
		return out;
	}

	function compactSlotDescriptor(slot) {
		var out = {};
		["name", "label", "inline", "scope", "input", "local", "current", "error", "description"].forEach(function (key) {
			if (slot && slot[key] !== undefined && slot[key] !== null && slot[key] !== "") {
				out[key] = slot[key];
			}
		});
		return out;
	}

	function compactOutputDescriptors(descriptor, env) {
		var outputs = descriptor.outputs || descriptor.output || {};
		var out = {};
		if (!outputs || typeof outputs !== "object") {
			return out;
		}
		if (outputs.type || outputs.properties || outputs.items) {
			out.out = env.schemaSummary(outputs);
			return out;
		}
		Object.keys(outputs).sort().forEach(function (name) {
			var schema = outputs[name];
			if (schema && typeof schema === "object") {
				out[name] = env.schemaSummary(schema);
			}
		});
		return out;
	}

	function compactBlockDescriptor(descriptor, env) {
		var properties = {};
		Object.keys(descriptor.props || {}).sort().forEach(function (name) {
			properties[name] = compactPropertyDescriptor(descriptor.props[name]);
		});
		var outputs = compactOutputDescriptors(descriptor, env);
		var out = {
			blockId: descriptor.blockId,
			description: descriptor.description || ""
		};
		if (Object.keys(properties).length > 0) {
			out.properties = properties;
		}
		if (Object.keys(outputs).length > 0) {
			out.outputs = outputs;
		}
		if (descriptor.tags && descriptor.tags.length) {
			out.tags = descriptor.tags;
		}
		if (descriptor.uses && descriptor.uses.length) {
			out.uses = descriptor.uses;
		}
		if (descriptor.implementation) {
			out.implementation = descriptor.implementation;
		}
		if (descriptor["private"] === true) {
			out["private"] = true;
		}
		if (descriptor.slots) {
			out.slots = descriptor.slots.map(compactSlotDescriptor);
		}
		return out;
	}

	function compactTypeDescriptor(type) {
		var out = {
			name: type.name,
			label: type.label || type.name,
			type: type.type || "unknown",
			origin: type.origin || "unknown",
			description: type.description || ""
		};
		if (type.editor && type.editor.component) {
			out.editor = type.editor.component;
		}
		return out;
	}

	function summaryPropertyDescriptor(property) {
		var parts = [];
		if (property && property.kind) {
			parts.push(String(property.kind));
		}
		if (property && property.type) {
			parts.push(String(property.type));
		}
		if (property && property.mode) {
			parts.push(String(property.mode));
		}
		return parts.join(":") || "value";
	}

	function blockSignature(descriptor) {
		var inputs = [];
		var outputs = [];
		Object.keys(descriptor.props || {}).sort().forEach(function (name) {
			var property = descriptor.props[name] || {};
			var signature = name;
			var type = summaryPropertyDescriptor(property);
			if (type && type !== "value") {
				signature += ":" + type;
			}
			if (property.mode === "write" || name === "out") {
				outputs.push(signature);
			} else {
				inputs.push(signature);
			}
		});
		return (inputs.length ? inputs.join(", ") : "-") + (outputs.length ? " -> " + outputs.join(", ") : "");
	}

	function signatureBlockDescriptor(descriptor, env) {
		var properties = {};
		Object.keys(descriptor.props || {}).sort().forEach(function (name) {
			properties[name] = summaryPropertyDescriptor(descriptor.props[name]);
		});
		var outputs = compactOutputDescriptors(descriptor, env);
		var out = {
			block: descriptor.blockId,
			sig: blockSignature(descriptor),
			desc: descriptor.description || ""
		};
		if (Object.keys(properties).length > 0) {
			out.props = properties;
		}
		if (Object.keys(outputs).length > 0) {
			out.outputs = outputs;
		}
		if (descriptor.slots) {
			out.slots = descriptor.slots.map(function (slot) {
				return slot.name;
			});
		}
		if (descriptor["private"] === true) {
			out["private"] = true;
		}
		return out;
	}

	function summaryBlockDescriptor(descriptor) {
		var out = {
			block: descriptor.blockId,
			sig: blockSignature(descriptor),
			desc: descriptor.description || ""
		};
		if (descriptor.slots) {
			out.slots = descriptor.slots.map(function (slot) {
				return slot.name;
			});
		}
		return out;
	}

	function filterPrivateDescriptors(descriptors, options) {
		options = options || {};
		if (options.includePrivate === true) {
			return descriptors;
		}
		return descriptors.filter(function (descriptor) {
			return descriptor["private"] !== true;
		});
	}

	function catalogSearchText(descriptor) {
		return [
			descriptor.blockId,
			descriptor.name,
			descriptor.localName,
			descriptor.namespace,
			descriptor.provider,
			descriptor.origin,
			descriptor.description,
			(descriptor.tags || []).join(" "),
			Object.keys(descriptor.props || {}).join(" ")
		].join(" ").toLowerCase();
	}

	function catalogQueryScore(descriptor, query) {
		query = String(query || "").toLowerCase().trim();
		if (!query) {
			return 1;
		}
		var text = catalogSearchText(descriptor);
		var blockId = String(descriptor.blockId || descriptor.name || "").toLowerCase();
		var localName = String(descriptor.localName || "").toLowerCase();
		var namespace = String(descriptor.namespace || "").toLowerCase();
		var tokens = query.split(/\s+/);
		var score = 0;
		if (blockId === query || localName === query) {
			score += 100;
		} else if (blockId.indexOf(query) !== -1) {
			score += 30;
		}
		for (var i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			if (!token) {
				continue;
			}
			if (blockId === token || localName === token) {
				score += 12;
			} else if (blockId.indexOf(token) !== -1 || localName.indexOf(token) !== -1) {
				score += 8;
			} else if (namespace.indexOf(token) !== -1) {
				score += 4;
			} else if (text.indexOf(token) !== -1) {
				score += 1;
			}
		}
		return score;
	}

	function filterCatalogDescriptors(descriptors, options) {
		options = options || {};
		var query = String(options.query || options.q || "").toLowerCase().trim();
		var namespace = String(options.namespace || "").trim();
		var provider = String(options.provider || "").trim();
		var origin = String(options.origin || "").trim();
		var filtered = descriptors.filter(function (descriptor) {
			if (namespace && String(descriptor.namespace || "") !== namespace &&
					String(descriptor.namespace || "").indexOf(namespace + ".") !== 0) {
				return false;
			}
			if (provider && String(descriptor.provider || "") !== provider) {
				return false;
			}
			if (origin && String(descriptor.origin || "") !== origin) {
				return false;
			}
			if (query) {
				return catalogQueryScore(descriptor, query) > 0;
			}
			return true;
		});
		if (query) {
			filtered.sort(function (a, b) {
				var scoreDiff = catalogQueryScore(b, query) - catalogQueryScore(a, query);
				if (scoreDiff !== 0) {
					return scoreDiff;
				}
				return String(a.blockId || a.name).localeCompare(String(b.blockId || b.name));
			});
		}
		return filtered;
	}

	function pagedCatalogDescriptors(descriptors, options) {
		options = options || {};
		var offset = parseInt(String(options.cursor || "0"), 10);
		if (isNaN(offset) || offset < 0) {
			offset = 0;
		}
		var limit = parseInt(String(options.limit || "0"), 10);
		if (isNaN(limit) || limit < 0) {
			limit = 0;
		}
		if (limit === 0) {
			return {
				items: descriptors,
				total: descriptors.length,
				nextCursor: null
			};
		}
		var items = descriptors.slice(offset, offset + limit);
		return {
			items: items,
			total: descriptors.length,
			nextCursor: offset + limit < descriptors.length ? String(offset + limit) : null
		};
	}

	function catalogPage(blocks, options, mapper, env) {
		var descriptors = Object.keys(blocks).sort().map(function (name) {
			return blockDescriptor(blocks[name], env);
		});
		descriptors = filterPrivateDescriptors(descriptors, options);
		descriptors = filterCatalogDescriptors(descriptors, options);
		var page = pagedCatalogDescriptors(descriptors, options);
		return {
			blocks: page.items.map(mapper),
			total: page.total,
			nextCursor: page.nextCursor
		};
	}

	function addCatalogDocs(out, options) {
		options = options || {};
		if (options.doc !== false) {
			out.doc = "Flow palette. Use summary to discover block names, compact for typed properties, and full only when source-level metadata is required. Compact block descriptors expose typed properties under 'properties'.";
		}
		if (options.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Natural queries are scored token-by-token, so query='requestable call transaction sequence connector' still returns requestable.call even if not every word matches.",
				"Keep calls narrow with query, namespace, provider, origin, limit and cursor. Prefer limit<=20 for discovery.",
				"After finding a candidate block, call flow-block-get for the exact block instead of requesting detail='full' for the whole palette.",
				"Use includeTypes=true or includeLibraries=true only when a compact catalog response must include type or library details.",
				"Use flow-search before palette browsing when an existing Flow example may already show the intended pattern."
			];
		}
		return out;
	}

	function summaryCatalogDefinition(blocks, options, env) {
		var page = catalogPage(blocks, options, summaryBlockDescriptor, env);
		var types = env.loadTypes();
		return addCatalogDocs({
			detail: "summary",
			count: page.blocks.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: page.blocks,
			libraryCount: env.listFlowLibraries().length,
			typeCount: Object.keys(types).length,
			next: "This is the short palette. Use query/namespace/provider to stay narrow, detail='signature' for typed signatures, flow-block-get for one block, detail='full' only for source-level details."
		}, options);
	}

	function signatureCatalogDefinition(blocks, options, env) {
		var page = catalogPage(blocks, options, function (descriptor) {
			return signatureBlockDescriptor(descriptor, env);
		}, env);
		return addCatalogDocs({
			detail: "signature",
			count: page.blocks.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: page.blocks,
			next: "Use flow-block-get for one candidate block. Use flow-search first when an executable sample may show the whole pattern."
		}, options);
	}

	function compactCatalogDefinition(blocks, options, env) {
		var fullPage = catalogPage(blocks, options, function (descriptor) { return descriptor; }, env);
		var page = catalogPage(blocks, options, function (descriptor) {
			return compactBlockDescriptor(descriptor, env);
		}, env);
		var descriptors = page.blocks;
		var includeTypes = options.includeTypes === true || String(options.includeTypes || "") === "true";
		var includeLibraries = options.includeLibraries === true || String(options.includeLibraries || "") === "true";
		return addCatalogDocs({
			detail: "compact",
			count: descriptors.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: descriptors,
			libraryCount: env.listFlowLibraries().length,
			typeCount: Object.keys(env.loadTypes()).length,
			libraries: includeLibraries ? env.listFlowLibraries() : undefined,
			types: includeTypes ? catalogTypes(fullPage.blocks, env.loadTypes(), env).map(compactTypeDescriptor) : undefined,
			next: "Use flow-search for examples and flow-block-get for one block. Add includeTypes=true/includeLibraries=true only when those details are needed."
		}, options);
	}

	function catalogDefinition(blocks, options, env) {
		options = options || {};
		var detail = String(options.detail || options.mode || "full");
		if (detail === "summary") {
			return summaryCatalogDefinition(blocks, options, env);
		}
		if (detail === "signature") {
			return signatureCatalogDefinition(blocks, options, env);
		}
		if (detail === "compact") {
			return compactCatalogDefinition(blocks, options, env);
		}
		var page = catalogPage(blocks, options, function (descriptor) { return descriptor; }, env);
		var descriptors = page.blocks;
		var typeDescriptors = env.loadTypes();
		var groups = [];
		function groupLabel(provider, origin) {
			if (provider) {
				return provider;
			}
			if (origin === "core") {
				return "lib_flow_engine";
			}
			if (origin === "project") {
				return "Project";
			}
			return "Libraries";
		}
		function groupOrder(origin) {
			if (origin === "core") {
				return 0;
			}
			if (origin === "project") {
				return 1;
			}
			return 2;
		}
		descriptors.forEach(function (block) {
			var origin = block.origin || "unknown";
			var provider = block.provider || origin;
			var group = null;
			for (var i = 0; i < groups.length; i++) {
				if (groups[i].provider === provider) {
					group = groups[i];
					break;
				}
			}
			if (!group) {
				group = {
					origin: origin,
					provider: provider,
					name: groupLabel(provider, origin),
					order: groupOrder(origin),
					blocks: []
				};
				groups.push(group);
			}
			group.blocks.push(block);
		});
		if (env.projectDir()) {
			var hasProjectGroup = false;
			var projectProvider = env.flowProviderName(new env.File(env.projectDir(), "libs/flow"), "project");
			for (var i = 0; i < groups.length; i++) {
				if (groups[i].origin === "project") {
					hasProjectGroup = true;
					break;
				}
			}
			if (!hasProjectGroup) {
				groups.push({
					origin: "project",
					provider: projectProvider,
					name: groupLabel(projectProvider, "project"),
					order: groupOrder("project"),
					blocks: []
				});
			}
		}
		groups.sort(function (a, b) {
			return a.order - b.order || a.name.localeCompare(b.name);
		});
		groups.forEach(function (group) {
			delete group.order;
		});
		return addCatalogDocs({
			detail: "full",
			count: descriptors.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: descriptors,
			groups: groups,
			libraries: env.listFlowLibraries(),
			types: catalogTypes(descriptors, typeDescriptors, env)
		}, options);
	}

	function inferredTypeDescriptor(name) {
		return {
			name: name,
			label: name,
			icon: "mdi:form-textbox",
			origin: "inferred",
			description: "Inferred property type. Add a Flow type descriptor to provide docs, validation and editor resources.",
			inferred: true,
			uses: []
		};
	}

	function catalogTypes(blocks, types, env) {
		var byName = {};
		Object.keys(types || {}).sort().forEach(function (name) {
			var descriptor = typeDescriptor(types[name], env);
			descriptor.uses = [];
			byName[descriptor.name] = descriptor;
		});
		(blocks || []).forEach(function (block) {
			Object.keys(block.props || {}).forEach(function (propName) {
				var prop = block.props[propName] || {};
				var name = String(prop.kind || prop.type || "unknown");
				if (!byName[name]) {
					byName[name] = inferredTypeDescriptor(name);
				}
				if (!byName[name].type && prop.type) {
					byName[name].type = String(prop.type || "");
				}
				byName[name].uses.push({
					block: block.blockId || block.name,
					property: propName,
					type: String(prop.type || ""),
					mode: String(prop.mode || ""),
					file: String(block.file || "")
				});
			});
		});
		return Object.keys(byName).sort().map(function (name) {
			return byName[name];
		});
	}

	return {
		blockDescriptor: blockDescriptor,
		typeDescriptor: typeDescriptor,
		compactBlockDescriptor: compactBlockDescriptor,
		signatureBlockDescriptor: signatureBlockDescriptor,
		compactTypeDescriptor: compactTypeDescriptor,
		summaryBlockDescriptor: summaryBlockDescriptor,
		catalogDefinition: catalogDefinition,
		catalogTypes: catalogTypes
	};
}())
