(function () {
	function frontbuilderSettings(config) {
		var root = config && config.frontbuilder;
		if (!root || typeof root !== "object") {
			return [];
		}
		return Object.keys(root).sort().map(function (key) {
			var settings = root[key];
			if (!settings || typeof settings !== "object") {
				settings = {};
			}
			return {
				name: key,
				settings: settings
			};
		});
	}

	function resolveFile(base, value, env) {
		var path = String(value || "").trim();
		if (!path) {
			return null;
		}
		var file = new env.File(path);
		if (!file.isAbsolute()) {
			file = new env.File(base, path);
		}
		return file;
	}

	function resourceRootForSettings(settings, env) {
		var projectRoot = env.projectDir();
		if (!projectRoot) {
			return null;
		}
		return resolveFile(projectRoot, settings.resourceRoot || "", env);
	}

	function modelFileForSettings(settings, env) {
		var projectRoot = env.projectDir();
		if (!projectRoot || !settings || !settings.modelPath) {
			return null;
		}
		return resolveFile(projectRoot, settings.modelPath || "", env);
	}

	function modelComponentsDirForSettings(settings, env) {
		var modelFile = modelFileForSettings(settings, env);
		if (!modelFile) {
			return null;
		}
		var parent = modelFile.getParentFile();
		return parent ? new env.File(parent, "components") : null;
	}

	function projectFrontendRootForSettings(builderName, settings, env) {
		var projectRoot = env.projectDir();
		if (!projectRoot) {
			return null;
		}
		return new env.File(projectRoot, "libs/flow/frontbuilder/" + safePathSegment(builderName || "svelte"));
	}

	function canonicalPath(file) {
		if (!file) {
			return "";
		}
		try {
			return String(file.getCanonicalPath());
		} catch (e) {
			return String(file.getAbsolutePath());
		}
	}

	function sameFile(left, right) {
		var leftPath = canonicalPath(left);
		var rightPath = canonicalPath(right);
		return leftPath && rightPath && leftPath === rightPath;
	}

	function arrayCopy(value, fallback) {
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.slice();
		}
		if (typeof value === "string" && value) {
			return [value];
		}
		return fallback ? fallback.slice() : [];
	}

	function frontendUiBlockTraits(raw) {
		return arrayCopy(raw && raw.traits, ["ui.block"]);
	}

	function frontendActionTraits(raw) {
		return arrayCopy(raw && raw.traits, ["ui.action"]);
	}

	function frontendDefinitionTraits(value, fallback) {
		return arrayCopy(value, fallback);
	}

	function currentProjectProvider(env) {
		var projectRoot = env.projectDir && env.projectDir();
		return projectRoot ? String(projectRoot.getName()) : "project";
	}

	function projectProviderForResourceRoot(root, env) {
		var path = canonicalPath(root);
		if (!path) {
			return "";
		}
		var marker = env.File.separator + "libs" + env.File.separator + "flow" + env.File.separator;
		var index = path.indexOf(marker);
		if (index < 0) {
			return "";
		}
		var projectPath = path.substring(0, index);
		if (!projectPath) {
			return "";
		}
		return String(new env.File(projectPath).getName());
	}

	function rootProvider(root, projectFrontendRoot, builderName, settings, env) {
		if (sameFile(root, projectFrontendRoot)) {
			return currentProjectProvider(env);
		}
		return projectProviderForResourceRoot(root, env) || "frontbuilder." + builderName;
	}

	function isUnderProject(file, env) {
		var projectRoot = env.projectDir && env.projectDir();
		var projectPath = canonicalPath(projectRoot);
		var filePath = canonicalPath(file);
		return !!projectPath && !!filePath && (filePath === projectPath || filePath.indexOf(projectPath + env.File.separator) === 0);
	}

	function sourceMetadataForFile(file, builderName, env, providerHint) {
		var provider = projectProviderForResourceRoot(file, env) || providerHint || "frontbuilder." + builderName;
		var writable = isUnderProject(file, env);
		var metadata = {
			provider: provider,
			sourcePath: String(file.getAbsolutePath()),
			file: String(file.getAbsolutePath()),
			sourceOrigin: writable ? "project" : "library",
			sourceWritable: writable
		};
		if (writable && typeof env.resourceRelativePath === "function") {
			metadata.sourceRelativePath = env.resourceRelativePath(env.projectDir(), file);
		}
		return metadata;
	}

	function sortedFiles(dir, env) {
		var files = dir && dir.listFiles();
		if (!files) {
			return [];
		}
		files = env.Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		return files;
	}

	function collectUiBlockFiles(dir, env, out) {
		sortedFiles(dir, env).forEach(function (file) {
			if (file.isDirectory()) {
				collectUiBlockFiles(file, env, out);
				return;
			}
			if (file.isFile() && String(file.getName()).endsWith(".uiblock.json")) {
				out.push(file);
			}
		});
	}

	function collectSvelteComponentFiles(dir, env, out) {
		sortedFiles(dir, env).forEach(function (file) {
			if (file.isDirectory()) {
				collectSvelteComponentFiles(file, env, out);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var name = String(file.getName());
			if ((name.endsWith(".flow.svelte") || name.endsWith(".svelte")) &&
					!name.endsWith(".svelte.js") && !name.endsWith(".svelte.ts")) {
				out.push(file);
			}
		});
	}

	function collectSvelteActionFiles(dir, env, out) {
		sortedFiles(dir, env).forEach(function (file) {
			if (file.isDirectory()) {
				collectSvelteActionFiles(file, env, out);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var name = String(file.getName());
			if (name.endsWith(".svelte.js") || name.endsWith(".svelte.ts")) {
				out.push(file);
			}
		});
	}

	function svelteConst(source, name) {
		source = String(source || "");
		var marker = "export const " + name;
		var index = source.indexOf(marker);
		if (index < 0) {
			return null;
		}
		var equals = source.indexOf("=", index + marker.length);
		if (equals < 0) {
			return null;
		}
		var start = source.indexOf("{", equals);
		if (start < 0) {
			return null;
		}
		var depth = 0;
		var quote = "";
		var escaped = false;
		for (var i = start; i < source.length; i++) {
			var ch = source.charAt(i);
			if (quote) {
				if (escaped) {
					escaped = false;
				} else if (ch === "\\") {
					escaped = true;
				} else if (ch === quote) {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				quote = ch;
				continue;
			}
			if (ch === "{") {
				depth++;
			} else if (ch === "}") {
				depth--;
				if (depth === 0) {
					try {
						return Function("return (" + source.substring(start, i + 1) + ");")();
					} catch (e) {
						return null;
					}
				}
			}
			}
			return null;
		}

	function svelteMeta(source) {
		return svelteConst(source, "_meta");
	}

	function svelteFlow(source) {
		return svelteConst(source, "_flow");
	}

	function svelteComponentMeta(source, file) {
		var meta = svelteMeta(source);
		if (meta) {
			return meta;
		}
		return flowComponentMeta(svelteFlow(source), file) || frontAstComponentMeta(source, file);
	}

	function frontAstComponentMeta(source, file) {
		source = String(source || "");
		var match = source.match(/<FlowComponent\b([^>]*)>/);
		if (!match) {
			return null;
		}
		var attrs = parseTagAttributes(match[1]);
		var componentName = String(file.getName()).replace(/\.flow\.svelte$/, "").replace(/\.svelte$/, "");
		var id = String(attrs.id || componentName.charAt(0).toLowerCase() + componentName.substring(1)).trim();
		if (id.indexOf(".") < 0) {
			id = "project." + id;
		}
		var nameParts = frontendNameParts(id, componentName);
		var label = String(attrs.label || attrs.title || componentName);
		return {
			version: 1,
			id: id,
			name: label,
			label: label,
			category: "Project / UI blocks",
			kind: "widget",
			tag: componentName,
			icon: attrs.icon || "mdi:view-module-outline",
			runtime: "flow-svelte",
			description: attrs.description || label,
			traits: ["ui.block"],
			targetKinds: ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
			acceptedPositions: ["inside"],
			props: {},
			snippets: {},
			insert: {
				id: nameParts.localName,
				kind: nameParts.localName,
				tag: componentName
			},
			implementation: {
				kind: "flow-svelte",
				file: "./" + String(file.getName())
			}
		};
	}

	function parseTagAttributes(raw) {
		var props = {};
		var re = /([A-Za-z_][A-Za-z0-9_:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s>]+))/g;
		var match;
		while ((match = re.exec(String(raw || ""))) !== null) {
			props[match[1]] = match[2] !== undefined ? match[2]
				: match[3] !== undefined ? match[3]
				: match[4] !== undefined ? match[4]
				: match[5] !== undefined ? match[5]
				: "";
		}
		return props;
	}

	function flowComponentMeta(flow, file) {
		if (!flow || typeof flow !== "object") {
			return null;
		}
		flow = flow || {};
		var kind = String(flow.kind || "").trim();
		if (kind && kind !== "component") {
			return null;
		}
		var componentName = String(file.getName()).replace(/\.flow\.svelte$/, "").replace(/\.svelte$/, "");
		var id = String(flow.id || componentName.charAt(0).toLowerCase() + componentName.substring(1)).trim();
		if (id.indexOf(".") < 0) {
			id = "project." + id;
		}
		var nameParts = frontendNameParts(id, componentName);
		return {
			version: flow.version || 1,
			id: id,
			name: flow.name || flow.title || componentName,
			label: flow.label || flow.title || componentName,
			category: flow.category || "Project / UI blocks",
			kind: flow.blockKind || "widget",
			tag: flow.tag || componentName,
			icon: flow.icon || "mdi:view-module-outline",
			runtime: "flow-svelte",
			description: flow.description || flow.title || "",
			traits: frontendUiBlockTraits(flow),
			slots: flow.slots || {},
			targetKinds: flow.targetKinds || ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
			acceptedPositions: flow.acceptedPositions || ["inside"],
			props: flow.props || flow.properties || {},
			snippets: flow.snippets || {},
			insert: flow.insert || {
				id: nameParts.localName,
				kind: nameParts.localName,
				tag: flow.tag || componentName
			},
			implementation: flow.implementation || {
				kind: "flow-svelte",
				file: "./" + String(file.getName())
			}
		};
	}

	function normalizeSvelteComponent(raw, file, builderName, settings, env, providerHint) {
		if (!raw) {
			return null;
		}
		raw = env.normalizeTree(raw || {});
		var fileName = String(file.getName());
		var componentName = fileName.replace(/\.flow\.svelte$/, "").replace(/\.svelte$/, "");
		var insert = raw.insert || {};
		var id = String(raw.id || "").trim();
		if (!id) {
			id = "svelte." + componentName.charAt(0).toLowerCase() + componentName.substring(1);
		}
		var nameParts = frontendNameParts(id, componentName);
		var label = raw.label || raw.name || componentName;
		if (!insert.kind) {
			insert.kind = nameParts.localName;
		}
		if (!insert.tag) {
			insert.tag = componentName;
		}
		if (!insert.id) {
			insert.id = insert.kind;
		}
		var properties = raw.properties || raw.props || {};
		var source = sourceMetadataForFile(file, builderName, env, providerHint);
		var descriptor = {
			id: id,
			name: raw.name || label,
			localName: raw.localName || nameParts.localName,
			namespace: raw.namespace || nameParts.namespace,
			label: label,
			category: raw.category || "Svelte / UI blocks",
			kind: raw.kind || "widget",
			tag: raw.tag || insert.tag || componentName,
			aliases: raw.aliases && Object.prototype.toString.call(raw.aliases) === "[object Array]" ? raw.aliases.slice() : [],
			targetKinds: raw.targetKinds || ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
			acceptedPositions: raw.acceptedPositions || ["inside"],
			description: raw.description || "",
			longDescription: raw.longDescription || "",
			icon: raw.icon || "mdi:view-module-outline",
			traits: frontendUiBlockTraits(raw),
			slots: raw.slots || {},
			insert: insert,
			defaults: raw.defaults || insert,
			properties: properties,
			snippets: raw.snippets || {},
			runtime: raw.runtime || (fileName.endsWith(".flow.svelte") ? "flow-svelte" : "svelte"),
			implementation: raw.implementation || {
				kind: fileName.endsWith(".flow.svelte") ? "flow-svelte" : "svelte",
				file: String(file.getAbsolutePath())
			},
			builder: builderName,
			target: settings.target || "",
			provider: source.provider,
			declaredProvider: raw.provider || "",
			visibility: raw.visibility || "public",
			sourceBacked: true,
			descriptorKind: "source",
			sourcePath: source.sourcePath,
			sourceRelativePath: source.sourceRelativePath || "",
			sourceOrigin: source.sourceOrigin,
			file: source.file,
			sourceWritable: source.sourceWritable
		};
		if (typeof env.resolveBlockIcon === "function") {
			env.resolveBlockIcon({
				__flowFile: String(file.getAbsolutePath())
			}, descriptor);
		}
		return descriptor;
	}

	function normalizeSvelteAction(raw, file, builderName, settings, env, providerHint) {
		raw = env.normalizeTree(raw || {});
		var fileName = String(file.getName());
		var actionName = fileName.replace(/\.svelte\.(js|ts)$/, "");
		var id = String(raw.id || "").trim();
		if (!id) {
			id = "project." + actionName;
		}
		var nameParts = frontendNameParts(id, actionName);
		var source = sourceMetadataForFile(file, builderName, env, providerHint);
		var descriptor = {
			id: id,
			name: raw.name || raw.label || actionName,
			localName: raw.localName || nameParts.localName,
			namespace: raw.namespace || nameParts.namespace,
			label: raw.label || raw.name || actionName,
			category: raw.category || "Svelte / Actions",
			kind: raw.kind || "frontendSharedActionDefinition",
			tag: "",
			aliases: raw.aliases && Object.prototype.toString.call(raw.aliases) === "[object Array]" ? raw.aliases.slice() : [],
			targetKinds: raw.targetKinds || ["frontendSharedActions", "frontendClientActions", "frontendBuilder"],
			acceptedPositions: raw.acceptedPositions || ["inside"],
			description: raw.description || "",
			longDescription: raw.longDescription || "",
			icon: raw.icon || "mdi:gesture-tap",
			traits: frontendActionTraits(raw),
			slots: raw.slots || {},
			insert: raw.insert || {
				id: nameParts.localName,
				kind: "sharedAction",
				action: actionName
			},
			defaults: raw.defaults || {},
			properties: raw.properties || raw.props || {},
			snippets: {},
			runtime: raw.runtime || (fileName.endsWith(".ts") ? "svelte-ts-action" : "svelte-action"),
			implementation: raw.implementation || {
				kind: fileName.endsWith(".ts") ? "svelte-ts-action" : "svelte-action",
				file: String(file.getAbsolutePath())
			},
			builder: builderName,
			target: settings.target || "",
			provider: source.provider,
			declaredProvider: raw.provider || "",
			visibility: raw.visibility || "public",
			sourceBacked: true,
			descriptorKind: "source",
			sourcePath: source.sourcePath,
			sourceRelativePath: source.sourceRelativePath || "",
			sourceOrigin: source.sourceOrigin,
			file: source.file,
			sourceWritable: source.sourceWritable
		};
		if (typeof env.resolveBlockIcon === "function") {
			env.resolveBlockIcon({
				__flowFile: String(file.getAbsolutePath())
			}, descriptor);
		}
		return descriptor;
	}

	function normalizeUiBlock(raw, file, builderName, settings, env, providerHint) {
		raw = env.normalizeTree(raw || {});
		var id = String(raw.id || "").trim();
		if (!id) {
			id = builderName + "." + String(file.getName()).replace(/\.uiblock\.json$/, "");
		}
		var insert = raw.insert || {};
		var label = raw.label || raw.name || id;
		var nameParts = frontendNameParts(id, label);
		var tag = String(raw.tag || insert.tag || pascalCase(insert.kind || label || id));
		var aliases = raw.aliases && Object.prototype.toString.call(raw.aliases) === "[object Array]" ? raw.aliases.slice() : [];
		if (String(label).toUpperCase() === String(label) && String(label).toLowerCase() === tag.toLowerCase() && aliases.indexOf(label) === -1) {
			aliases.push(label);
		}
		var source = sourceMetadataForFile(file, builderName, env, providerHint);
		var descriptor = {
			id: id,
			name: raw.name || label,
			localName: raw.localName || nameParts.localName,
			namespace: raw.namespace || nameParts.namespace,
			label: label,
			category: raw.category || "Svelte / Widgets",
			kind: raw.kind || "widget",
			tag: tag,
			aliases: aliases,
			targetKinds: raw.targetKinds || ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
			acceptedPositions: raw.acceptedPositions || ["inside"],
			description: raw.description || "",
			icon: raw.icon || "mdi:view-module-outline",
			traits: frontendUiBlockTraits(raw),
			slots: raw.slots || {},
			insert: insert,
			defaults: raw.defaults || insert,
			properties: raw.properties || {},
			builder: builderName,
			target: settings.target || "",
			provider: source.provider,
			declaredProvider: raw.provider || "",
			sourceBacked: true,
			descriptorKind: "source",
			sourcePath: source.sourcePath,
			sourceRelativePath: source.sourceRelativePath || "",
			sourceOrigin: source.sourceOrigin,
			file: source.file,
			sourceWritable: source.sourceWritable
		};
		if (typeof env.resolveBlockIcon === "function") {
			env.resolveBlockIcon({
				__flowFile: String(file.getAbsolutePath())
			}, descriptor);
		}
		return descriptor;
	}

	function frontendAuthoringDescriptor(builderName, settings, options) {
		options = options || {};
		var insert = options.insert || {};
		var nameParts = frontendNameParts(options.id || "", options.name || options.label || options.id);
		return {
			id: options.id,
			name: options.name || options.label,
			localName: nameParts.localName,
			namespace: options.namespace || nameParts.namespace,
			label: options.label || options.name || options.id,
			category: options.category || "Svelte / Structure",
			kind: options.kind || "frontendDefinition",
			tag: options.tag || "",
			aliases: options.aliases || [],
			targetKinds: options.targetKinds || [],
			acceptedPositions: options.acceptedPositions || [],
			description: options.description || "",
			icon: options.icon || "mdi:shape-outline",
			traits: arrayCopy(options.traits, []),
			slots: options.slots || {},
			insert: insert,
			defaults: options.defaults || insert,
			properties: options.properties || {},
			builder: builderName,
			target: settings.target || "",
			provider: settings.provider || "frontbuilder." + builderName,
			sourceBacked: false,
			createAction: true,
			descriptorKind: "create",
			sourcePath: "",
			file: "",
			sourceWritable: true
		};
	}

	function frontendSvelteEventDescriptors(builderName, settings) {
		var events = [
			"beforeinput",
			"click",
			"change",
			"dblclick",
			"contextmenu",
			"focusin",
			"focusout",
			"input",
			"keydown",
			"keyup",
			"mousedown",
			"mousemove",
			"mouseout",
			"mouseover",
			"mouseup",
			"pointerdown",
			"pointermove",
			"pointerout",
			"pointerover",
			"pointerup",
			"submit",
			"touchend",
			"touchmove",
			"touchstart"
		];
		return events.map(function (eventName) {
			var label = "On" + eventName.replace(/(^|[^a-z0-9])([a-z0-9])/g, function (_, sep, chr) {
				return chr.toUpperCase();
			});
			return frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.on" + eventName,
				label: label,
				category: "Svelte / Events",
				kind: "frontendEventDefinition",
				icon: "mdi:flash-outline",
				traits: ["ui.event"],
				slots: {
					actions: {
						label: "Actions",
						accepts: ["ui.action"]
					}
				},
				targetKinds: ["frontendEvents"],
				acceptedPositions: ["inside"],
				description: "Adds a Svelte 5 DOM event handler.",
				insert: {
					id: "on" + eventName,
					kind: "event",
					tag: label,
					event: eventName,
					actions: []
				},
				properties: {
					id: { type: "string" },
					event: { type: "string", readOnly: true }
				}
			});
		});
	}

	function frontendAuthoringBlocksForSettings(builderName, settings, env) {
		settings = settings || {};
		var blocks = [
			frontendBuilderBootstrapDescriptor(builderName, settings, env)
		].concat(frontendSourceDefinitionDescriptors(builderName, settings));
		return blocks.concat([
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.navigationItem",
				label: "Navigation item",
				category: "Svelte / Structure",
				kind: "frontendNavigationItemDefinition",
				icon: "mdi:link-variant",
				traits: ["definition.navigationItem"],
				targetKinds: ["frontendApp", "frontendNavigation"],
				acceptedPositions: ["inside"],
				description: "Adds a navigation item to the frontend app.",
				insert: {
					__frontendMutationPath: "app.navigation",
					label: "New page",
					route: "/page"
				},
				properties: {
					label: { type: "string" },
					route: { type: "string" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.layout",
				label: "Layout",
				category: "Svelte / Structure",
				kind: "frontendLayoutDefinition",
				icon: "mdi:page-layout-outline",
				traits: ["definition.layout"],
				targetKinds: ["frontendBuilder", "frontendLayouts"],
				acceptedPositions: ["inside"],
				description: "Adds a reusable frontend layout.",
				insert: {
					__frontendMutationPath: "layouts",
					id: "layout",
					title: "Layout",
					regions: [
						{ id: "content", role: "content" }
					]
				},
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					regions: { type: "array", kind: "array" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.layoutRegion",
				label: "Layout region",
				category: "Svelte / Structure",
				kind: "frontendLayoutRegionDefinition",
				icon: "mdi:page-layout-body",
				traits: ["definition.layoutRegion"],
				targetKinds: ["frontendLayout"],
				acceptedPositions: ["inside"],
				description: "Adds a region to a frontend layout.",
				insert: {
					id: "region",
					role: "content"
				},
				properties: {
					id: { type: "string" },
					role: { type: "string" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.property",
				label: "UI block property",
				category: "Svelte / Properties",
				kind: "frontendPropertyDefinition",
				icon: "mdi:form-textbox",
				traits: ["definition.property"],
				targetKinds: ["frontendBlockProperties"],
				acceptedPositions: ["inside"],
				description: "Adds a property to a source-backed frontend UI block definition.",
				insert: {
					__frontendPropertyDefinition: true,
					name: "property",
					label: "Property",
					kind: "text",
					type: "string",
					description: "Frontend UI block property."
				},
				properties: {
					name: { type: "string" },
					label: { type: "string" },
					kind: { type: "string" },
					type: { type: "string" },
					description: { type: "string" }
				}
			}),
		].concat(frontendSvelteEventDescriptors(builderName, settings), [
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.onMount",
				label: "OnMount",
				category: "Svelte / Lifecycle",
				kind: "frontendEventDefinition",
				icon: "mdi:play-circle-outline",
				traits: ["ui.block", "ui.event", "ui.container"],
				slots: {
					actions: {
						label: "Actions",
						accepts: ["ui.action"]
					}
				},
				targetKinds: ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
				acceptedPositions: ["inside"],
				description: "Runs explicit client actions when the page or component mounts.",
				insert: {
					id: "onMount",
					kind: "onMount",
					tag: "OnMount"
				},
				properties: {
					id: { type: "string" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.setValue",
				label: "Set value",
				category: "Svelte / Actions",
				kind: "frontendActionDefinition",
				icon: "mdi:variable-box-outline",
				traits: ["ui.action"],
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Stores a literal or bound value in local client action state.",
				insert: {
					id: "setValue",
					kind: "setValue",
					tag: "SetValue",
					target: "",
					value: { mode: "literal", value: true }
				},
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					value: { type: "binding", kind: "binding" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.updateList",
				label: "Update list",
				category: "Svelte / Actions",
				kind: "frontendActionDefinition",
				icon: "mdi:format-list-bulleted",
				traits: ["ui.action"],
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Updates a list held in local client action state.",
				insert: {
					id: "updateList",
					kind: "updateList",
					tag: "UpdateList",
					target: "listState",
					operation: "append",
					value: { mode: "literal", value: null },
					count: { mode: "literal", value: 0 }
				},
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					operation: { type: "string", "enum": ["set", "append", "truncate", "clear"] },
					value: { type: "binding", kind: "binding" },
					count: { type: "binding", kind: "binding" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.updateNumber",
				label: "Update number",
				category: "Svelte / Actions",
				kind: "frontendActionDefinition",
				icon: "mdi:numeric",
				traits: ["ui.action"],
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Updates a bounded numeric value held in local client action state.",
				insert: {
					id: "updateNumber",
					kind: "updateNumber",
					tag: "UpdateNumber",
					target: "numberState",
					operation: "set",
					value: { mode: "literal", value: 0 },
					step: { mode: "literal", value: 1 }
				},
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					operation: { type: "string", "enum": ["set", "increment", "decrement"] },
					value: { type: "binding", kind: "binding" },
					step: { type: "binding", kind: "binding" },
					min: { type: "binding", kind: "binding" },
					max: { type: "binding", kind: "binding" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.navigate",
				label: "Navigate",
				category: "Svelte / Actions",
				kind: "frontendActionDefinition",
				icon: "mdi:arrow-right-circle-outline",
				traits: ["ui.action"],
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Navigates after preceding client actions complete.",
				insert: {
					id: "navigate",
					kind: "navigate",
					tag: "Navigate",
					to: "/",
					replace: false
				},
				properties: {
					id: { type: "string" },
					to: { type: "string", kind: "text" },
					replace: { type: "boolean", kind: "boolean" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.goBack",
				label: "Go back",
				category: "Svelte / Actions",
				kind: "frontendActionDefinition",
				icon: "mdi:arrow-left-circle-outline",
				traits: ["ui.action"],
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Returns through application history with a direct-entry fallback route.",
				insert: {
					id: "goBack",
					kind: "goBack",
					tag: "GoBack",
					fallback: "/"
				},
				properties: {
					id: { type: "string" },
					fallback: { type: "string", kind: "text" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.callSequence",
				label: "CallSequence",
				category: "Svelte / Actions",
				kind: "frontendActionDefinition",
				icon: "mdi:play-box-outline",
				traits: ["ui.action"],
				slots: {
					variables: {
						label: "Variables",
						accepts: ["ui.action.variable"]
					}
				},
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Adds a client-side action that calls a Convertigo requestable.",
				insert: {
					id: "callSequence",
					kind: "callSequence",
					tag: "CallSequence",
					target: "",
					requestable: ".Sequence",
				},
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					requestable: { type: "requestable", kind: "requestable" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.client.fullsync.get",
				label: "FullSync Get",
				category: "Svelte / FullSync",
				kind: "frontendActionDefinition",
				icon: "mdi:database-search-outline",
				traits: ["ui.action"],
				slots: { variables: { label: "Variables", accepts: ["ui.action.variable"] } },
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Reads one document from the local FullSync database.",
				insert: { id: "fullSyncGet", kind: "fullSyncGet", tag: "FullSyncGet", target: "", database: "", docid: "" },
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					database: { type: "string", kind: "fullsync" },
					docid: { type: "binding", kind: "binding" },
					marker: { type: "string" },
					schemaRequestable: { type: "requestable", kind: "requestable" },
					schemaInput: { type: "object", kind: "literal" },
					outputSchema: { type: "object", kind: "literal" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.client.fullsync.view",
				label: "FullSync View",
				category: "Svelte / FullSync",
				kind: "frontendActionDefinition",
				icon: "mdi:database-eye-outline",
				traits: ["ui.action"],
				slots: { variables: { label: "Variables", accepts: ["ui.action.variable"] } },
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Queries one view from the local FullSync database.",
				insert: { id: "fullSyncView", kind: "fullSyncView", tag: "FullSyncView", target: "", database: "", ddoc: "", view: "" },
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					database: { type: "string", kind: "fullsync" },
					ddoc: { type: "string" },
					view: { type: "string" },
					marker: { type: "string" },
					schemaRequestable: { type: "requestable", kind: "requestable" },
					schemaInput: { type: "object", kind: "literal" },
					outputSchema: { type: "object", kind: "literal" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.client.fullsync.reset",
				label: "FullSync Reset",
				category: "Svelte / FullSync",
				kind: "frontendActionDefinition",
				icon: "mdi:database-refresh-outline",
				traits: ["ui.action"],
				slots: {},
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Resets a local FullSync database once per optional migration marker.",
				insert: { id: "fullSyncReset", kind: "fullSyncReset", tag: "FullSyncReset", target: "", database: "", marker: "" },
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					database: { type: "string", kind: "fullsync" },
					marker: { type: "string" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.client.fullsync.sync",
				label: "FullSync Sync",
				category: "Svelte / FullSync",
				kind: "frontendActionDefinition",
				icon: "mdi:database-sync-outline",
				traits: ["ui.action"],
				slots: { variables: { label: "Variables", accepts: ["ui.action.variable"] } },
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				description: "Synchronizes, pulls or pushes a FullSync database and reports progress.",
				insert: { id: "fullSyncSync", kind: "fullSyncSync", tag: "FullSyncSync", target: "", database: "", mode: "sync" },
				properties: {
					id: { type: "string" },
					target: { type: "string" },
					database: { type: "string", kind: "fullsync" },
					mode: { type: "string", enum: ["sync", "pull", "push"] },
					marker: { type: "string" },
					outputSchema: { type: "object", kind: "literal" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.dataBinding",
				label: "Data binding",
				category: "Svelte / Data",
				kind: "frontendDataBindingDefinition",
				icon: "mdi:database-arrow-right-outline",
				traits: ["ui.data.binding"],
				targetKinds: ["frontendDataBindings"],
				acceptedPositions: ["inside"],
				description: "Adds a data binding to a frontend UI block.",
				insert: {
					id: "dataBinding",
					kind: "dataBinding",
					tag: "DataBinding",
					source: "items",
					value: "items"
				},
				properties: {
					id: { type: "string" },
					source: { type: "string", kind: "path" },
					value: { type: "string", kind: "path" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.if",
				label: "If",
				category: "Svelte / Directives",
				kind: "frontendDirectiveBlockDefinition",
				icon: "mdi:source-branch",
				traits: ["ui.directive"],
				slots: {
					then: {
						label: "Then",
						accepts: ["ui.block", "ui.directive"]
					},
					else: {
						label: "Else",
						accepts: ["ui.block", "ui.directive"]
					}
				},
				targetKinds: ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
				acceptedPositions: ["inside"],
				description: "Adds a conditional frontend directive block.",
				insert: {
					id: "ifBlock",
					kind: "if",
					tag: "If",
					test: "true"
				},
				properties: {
					id: { type: "string" },
					test: { type: "binding", kind: "binding" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.elseIf",
				label: "ElseIf",
				category: "Svelte / Directives",
				kind: "frontendDirectiveBranchDefinition",
				icon: "mdi:source-branch",
				traits: ["ui.directive.branch"],
				slots: {
					structure: {
						label: "Structure",
						accepts: ["ui.block", "ui.directive"]
					}
				},
				targetKinds: ["frontendDirectiveBlock"],
				acceptedPositions: ["inside"],
				description: "Adds an else-if branch to a conditional frontend directive.",
				insert: {
					id: "elseIf",
					kind: "frontendDirectiveBranch",
					type: "elseIf",
					test: "true",
					children: []
				},
				properties: {
					id: { type: "string" },
					test: { type: "string", kind: "expression" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.else",
				label: "Else",
				category: "Svelte / Directives",
				kind: "frontendDirectiveBranchDefinition",
				icon: "mdi:source-branch",
				traits: ["ui.directive.branch"],
				slots: {
					structure: {
						label: "Structure",
						accepts: ["ui.block", "ui.directive"]
					}
				},
				targetKinds: ["frontendDirectiveBlock"],
				acceptedPositions: ["inside"],
				description: "Adds an else branch to a conditional frontend directive.",
				insert: {
					id: "else",
					kind: "frontendDirectiveBranch",
					type: "else",
					children: []
				},
				properties: {
					id: { type: "string" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.forEach",
				label: "ForEach",
				category: "Svelte / Directives",
				kind: "frontendDirectiveBlockDefinition",
				icon: "mdi:repeat",
				traits: ["ui.directive"],
				slots: {
					default: {
						label: "Each",
						accepts: ["ui.block", "ui.directive"]
					}
				},
				targetKinds: ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
				acceptedPositions: ["inside"],
				description: "Adds an iteration frontend directive block.",
				insert: {
					id: "forEach",
					kind: "each",
					tag: "ForEach",
					source: { mode: "literal", value: [] },
					context: "item"
				},
				properties: {
					id: { type: "string" },
					source: { type: "object", kind: "binding" },
					context: { type: "string" }
				}
			}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.await",
				label: "Await",
				category: "Svelte / Directives",
				kind: "frontendDirectiveBlockDefinition",
				icon: "mdi:timer-sand",
				traits: ["ui.directive"],
				slots: {
					pending: {
						label: "Pending",
						accepts: ["ui.block", "ui.directive"]
					},
					then: {
						label: "Then",
						accepts: ["ui.block", "ui.directive"]
					},
					catch: {
						label: "Catch",
						accepts: ["ui.block", "ui.directive"]
					}
				},
				targetKinds: ["frontendStructure", "frontendSlot", "frontendPage", "frontendRouteLayout", "frontendComponent"],
				acceptedPositions: ["inside"],
				description: "Adds an async frontend directive block.",
				insert: {
					id: "awaitBlock",
					kind: "await",
					tag: "Await",
					expression: "Promise.resolve()"
				},
				properties: {
					id: { type: "string" },
					expression: { type: "string", kind: "expression" }
				}
				}),
				frontendAuthoringDescriptor(builderName, settings, {
					id: "frontbuilder.svelte.variable",
					label: "Variable",
					category: "Svelte / Actions",
					kind: "frontendActionVariableDefinition",
					icon: "mdi:variable",
					traits: ["ui.action.variable"],
					targetKinds: ["frontendActionBlock", "frontendActionVariables"],
					acceptedPositions: ["inside"],
					description: "Adds an input variable to a frontend action.",
					insert: {
						id: "variable",
						kind: "variable",
						tag: "Variable",
						name: "variable",
						value: { mode: "literal", value: "" }
					},
					properties: {
						name: { type: "string" },
						value: { type: "binding", kind: "binding" }
					}
				}),
			frontendAuthoringDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.column",
				label: "Column",
				category: "Svelte / Data",
				kind: "frontendDataBlockDefinition",
				icon: "mdi:table-column",
				traits: ["ui.table.column"],
				targetKinds: ["frontendColumns"],
				acceptedPositions: ["inside"],
				description: "Adds a table column to a frontend Table block.",
				insert: {
					id: "column",
					kind: "column",
					tag: "Column",
					label: "Column",
					path: "value",
					value: "value"
				},
				properties: {
					label: { type: "string" },
					path: { type: "string", kind: "path" },
					value: { type: "string", kind: "path" }
				}
			})
			]));
		}

	function frontendSourceDefinitionDescriptors(builderName, settings) {
		return [
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.page",
				label: "Page",
				category: "Frontend page definitions",
				kind: "frontendPageDefinition",
				icon: "mdi:file-outline",
				traits: ["definition.routePage"],
				targetKinds: ["frontendBuilder", "frontendRoutes", "frontendRouteGroup", "frontendRouteSegment"],
				acceptedPositions: ["inside"],
				description: "Creates a source-backed low-code route page edited through its parsed .flow.svelte AST.",
				baseId: "page",
				directory: "${targetRouteDirectory}",
				fallbackDirectory: frontendPageSourceDirectory(builderName, settings),
				fileName: "+page.flow.svelte",
				source: frontendPageSourceTemplate()
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.layout",
				label: "Layout",
				category: "Frontend layout definitions",
				kind: "frontendRouteLayoutDefinition",
				icon: "mdi:page-layout-outline",
				traits: ["definition.routeLayout"],
				targetKinds: ["frontendBuilder", "frontendRoutes", "frontendRouteGroup", "frontendRouteSegment"],
				acceptedPositions: ["inside"],
				description: "Creates a source-backed SvelteKit route layout for the selected route segment.",
				baseId: "layout",
				directory: "${targetRouteDirectory}",
				fallbackDirectory: frontendPageSourceDirectory(builderName, settings),
				fileName: "+layout.flow.svelte",
				source: frontendRouteLayoutSourceTemplate()
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.routeSegment",
				label: "Route segment",
				category: "Frontend route definitions",
				kind: "frontendRouteSegmentDefinition",
				icon: "mdi:folder-outline",
				traits: ["definition.routeFolder"],
				targetKinds: ["frontendRoutes", "frontendRouteGroup", "frontendRouteSegment"],
				acceptedPositions: ["inside"],
				description: "Creates a SvelteKit route directory below the selected route segment.",
				baseId: "segment",
				directory: "${targetRouteDirectory}/${localName}",
				directoryOnly: true,
				markerFile: ".flow-route.json",
				markerSource: "{\n  \"kind\": \"segment\"\n}\n"
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.routeGroup",
				label: "Route group",
				category: "Frontend route definitions",
				kind: "frontendRouteGroupDefinition",
				icon: "mdi:folder-hidden",
				traits: ["definition.routeFolder"],
				targetKinds: ["frontendRoutes", "frontendRouteGroup", "frontendRouteSegment"],
				acceptedPositions: ["inside"],
				description: "Creates a SvelteKit pathless route group below the selected route segment.",
				baseId: "group",
				directory: "${targetRouteDirectory}/(${localName})",
				directoryOnly: true,
				markerFile: ".flow-route.json",
				markerSource: "{\n  \"kind\": \"group\"\n}\n"
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.routeParam",
				label: "Route parameter",
				category: "Frontend route definitions",
				kind: "frontendRouteSegmentDefinition",
				icon: "mdi:folder-key-outline",
				traits: ["definition.routeFolder"],
				targetKinds: ["frontendRoutes", "frontendRouteGroup", "frontendRouteSegment"],
				acceptedPositions: ["inside"],
				description: "Creates a SvelteKit dynamic route segment below the selected route segment.",
				baseId: "id",
				directory: "${targetRouteDirectory}/[${localName}]",
				directoryOnly: true,
				markerFile: ".flow-route.json",
				markerSource: "{\n  \"kind\": \"parameter\"\n}\n"
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.flowUiBlock",
				label: "Flow UI block",
				category: "Frontend block definitions",
				kind: "frontendUiBlockDefinition",
				icon: "mdi:view-module-outline",
				traits: ["definition.uiBlock"],
				targetKinds: ["frontendBuilder", "frontendBlocks", "frontendBlockProvider", "frontendBlockNamespace"],
				acceptedPositions: ["inside"],
				description: "Creates a source-backed low-code UI block edited through its parsed .flow.svelte AST.",
				baseId: "project.flowUiBlock",
				directory: frontendComponentSourceDirectory(builderName, settings) + "/${namespacePath}",
				fileName: "${tag}.flow.svelte",
				source: frontendUiBlockSourceTemplate("flow-svelte", "Flow UI block")
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.svelteUiBlock",
				label: "Svelte UI block",
				category: "Frontend block definitions",
				kind: "frontendUiBlockDefinition",
				icon: "mdi:svelte",
				traits: ["definition.uiBlock"],
				targetKinds: ["frontendBuilder", "frontendBlocks", "frontendBlockProvider", "frontendBlockNamespace"],
				acceptedPositions: ["inside"],
				description: "Creates a source-backed UI block implemented as pure Svelte code.",
				baseId: "project.svelteUiBlock",
				directory: frontendComponentSourceDirectory(builderName, settings) + "/${namespacePath}",
				fileName: "${tag}.svelte",
				source: frontendUiBlockSourceTemplate("svelte", "Svelte UI block")
			}),
			frontendSourceDefinitionDescriptor(builderName, settings, {
				id: "frontbuilder.svelte.svelteClientAction",
				label: "Svelte client action",
				category: "Frontend action definitions",
				kind: "frontendClientActionSourceDefinition",
				icon: "mdi:gesture-tap",
				traits: ["definition.clientAction"],
				targetKinds: ["frontendBuilder", "frontendActionBlocks", "frontendBlockProvider", "frontendBlockNamespace"],
				acceptedPositions: ["inside"],
				description: "Creates a source-backed client action implemented as a .svelte.js module.",
				baseId: "project.clientAction",
				directory: frontendActionSourceDirectory(builderName, settings) + "/${namespacePath}",
				fileName: "${actionName}.svelte.js",
				source: frontendClientActionSourceTemplate()
			})
		];
	}

	function frontendModelSourceDirectory(builderName, settings) {
		var rootPrefix = "libs/flow/frontbuilder/" + safePathSegment(builderName || "svelte") + "/";
		var modelPath = String(settings && settings.modelPath || "");
		var rootIndex = modelPath.indexOf(rootPrefix);
		if (rootIndex >= 0) {
			modelPath = modelPath.substring(rootIndex + rootPrefix.length);
		}
		var routesIndex = modelPath.indexOf("/src/routes/");
		if (routesIndex >= 0) {
			return modelPath.substring(0, routesIndex);
		}
		if (modelPath.endsWith("/+page.flow.svelte")) {
			return modelPath.substring(0, modelPath.length - "/+page.flow.svelte".length);
		}
		return "model/" + safePathSegment(builderName || "svelte");
	}

	function frontendPageSourceDirectory(builderName, settings) {
		return frontendModelSourceDirectory(builderName, settings) + "/src/routes";
	}

	function frontendComponentSourceDirectory(builderName, settings) {
		return frontendModelSourceDirectory(builderName, settings) + "/src/lib/components";
	}

	function frontendActionSourceDirectory(builderName, settings) {
		return frontendModelSourceDirectory(builderName, settings) + "/src/lib/actions";
	}

	function frontendSourceDefinitionDescriptor(builderName, settings, options) {
		return frontendAuthoringDescriptor(builderName, settings, {
			id: options.id,
			label: options.label,
			category: options.category,
			kind: options.kind,
			icon: options.icon,
			traits: options.traits,
			targetKinds: options.targetKinds,
			acceptedPositions: options.acceptedPositions,
			description: options.description,
			insert: {
				__frontendCreateSource: {
					baseId: options.baseId,
					directory: options.directory,
					fallbackDirectory: options.fallbackDirectory || "",
					fileName: options.fileName,
					source: options.source,
					directoryOnly: options.directoryOnly === true,
					markerFile: options.markerFile || "",
					markerSource: options.markerSource || ""
				}
			},
			properties: {}
		});
	}

	function frontendUiBlockSourceTemplate(runtime, description) {
		return [
			"<script module>",
			"  export const _meta = {",
			"    version: 1,",
			"    id: \"${id}\",",
			"    name: \"${tag}\",",
			"    label: \"${tag}\",",
			"    category: \"Project / UI blocks\",",
			"    kind: \"widget\",",
			"    tag: \"${tag}\",",
			"    icon: \"mdi:view-module-outline\",",
			"    runtime: \"" + runtime + "\",",
			"    description: \"" + description + ".\",",
			"    traits: [\"ui.block\"],",
			"    targetKinds: [\"frontendStructure\", \"frontendSlot\", \"frontendPage\", \"frontendRouteLayout\", \"frontendComponent\"],",
			"    acceptedPositions: [\"inside\"],",
			"    props: {",
			"      id: {",
			"        label: \"Id\",",
			"        kind: \"text\",",
			"        type: \"string\",",
			"        default: \"${localName}\",",
			"        description: \"Stable low-code object id.\"",
			"      },",
			"      title: {",
			"        label: \"Title\",",
			"        kind: \"text\",",
			"        type: \"string\",",
			"        default: \"${tag}\",",
			"        description: \"Visible UI block title.\"",
			"      }",
			"    },",
			"    snippets: {",
			"      children: {",
			"        label: \"Content\",",
			"        description: \"Child content rendered by the UI block.\"",
			"      }",
			"    },",
			"    insert: {",
			"      id: \"${localName}\",",
			"      kind: \"${localName}\",",
			"      tag: \"${tag}\",",
			"      title: \"${tag}\"",
			"    },",
			"    implementation: {",
			"      kind: \"" + runtime + "\",",
			"      file: \"./${fileName}\"",
			"    }",
			"  };",
			"</script>",
			"",
			"<script>",
			"  let { title = \"${tag}\", children } = $props();",
			"</script>",
			"",
			"<section>",
			"  <h2>{title}</h2>",
			"  {@render children?.()}",
			"</section>",
			""
		].join("\n");
	}

	function frontendPageSourceTemplate() {
		return [
			"<script module>",
			"  export const _flow = {",
			"    page: {",
			"      id: \"${localName}\",",
			"      title: \"${LocalName}\"",
			"    }",
			"  };",
			"</script>",
			"",
			"<FlowComponent id=\"${localName}\" label=\"${LocalName}\">",
			"  <Structure />",
			"</FlowComponent>",
			""
		].join("\n");
	}

	function frontendRouteLayoutSourceTemplate() {
		return [
			"<FlowComponent id=\"${localName}Layout\" label=\"${LocalName} layout\">",
			"  <Structure>",
			"    <PageShell id=\"pageShell\" maxWidth=\"1120px\" padding=\"24px\" gap=\"16px\" align=\"stretch\">",
			"      <Children>",
			"        <PageContent id=\"pageContent\" />",
			"      </Children>",
			"    </PageShell>",
			"  </Structure>",
			"</FlowComponent>",
			""
		].join("\n");
	}

	function frontendClientActionSourceTemplate() {
		return [
			"export const _meta = {",
			"  version: 1,",
			"  id: \"${id}\",",
			"  name: \"${actionName}\",",
			"  label: \"${actionName}\",",
			"  category: \"Project / Client actions\",",
			"  kind: \"frontendSharedActionDefinition\",",
			"  icon: \"mdi:gesture-tap\",",
			"  runtime: \"svelte-action\",",
			"  description: \"Reusable Svelte client action.\",",
			"  traits: [\"ui.action\"],",
			"  targetKinds: [\"frontendSharedActions\", \"frontendClientActions\", \"frontendBuilder\"],",
			"  properties: {",
			"    parameters: {",
			"      label: \"Parameters\",",
			"      kind: \"literal\",",
			"      type: \"object\",",
			"      default: {},",
			"      description: \"Action parameters.\"",
			"    }",
			"  },",
			"  implementation: {",
			"    kind: \"svelte-action\",",
			"    file: \"./${fileName}\"",
			"  }",
			"};",
			"",
			"export function ${actionName}(node, parameters = {}) {",
			"  void parameters;",
			"  return {",
			"    update(nextParameters = {}) {",
			"      parameters = nextParameters;",
			"    },",
			"    destroy() {",
			"    }",
			"  };",
			"}",
			""
		].join("\n");
	}

	function defaultBuilderResourceRoot(builderName, settings, env) {
		function usableRoot(root) {
			if (!root || !root.isDirectory()) {
				return "";
			}
			var cli = new env.File(root, "src-builder/frontDocumentCli.ts");
			return cli.isFile() ? String(root.getAbsolutePath()) : "";
		}
		if (settings && settings.resourceRoot) {
			var configuredRoot = usableRoot(resourceRootForSettings(settings, env));
			if (configuredRoot) {
				return settings.resourceRoot;
			}
		}
		if (String(builderName || "svelte") === "svelte" && env && typeof env.projectRootForName === "function") {
			var projectRoot = env.projectRootForName("lib_flow_frontbuilder_svelte");
			if (projectRoot) {
				var loadedRoot = usableRoot(new env.File(projectRoot, "libs/flow/frontbuilder/svelte"));
				if (loadedRoot) {
					return loadedRoot;
				}
			}
		}
		if (String(builderName || "svelte") === "svelte" && env && typeof env.engineDir === "function") {
			var engineFlowDir = env.engineDir();
			var engineProjectDir = engineFlowDir && engineFlowDir.getParentFile() && engineFlowDir.getParentFile().getParentFile();
			var gitRoot = engineProjectDir && engineProjectDir.getParentFile();
			if (gitRoot) {
				var devRoot = usableRoot(new env.File(gitRoot, "c8oprj-lib-flow-frontbuilder-svelte/libs/flow/frontbuilder/svelte"));
				if (devRoot) {
					return devRoot;
				}
			}
		}
		return "libs/flow/frontbuilder/svelte";
	}

	function frontendBuilderBootstrapDescriptor(builderName, settings, env) {
		settings = settings || {};
		builderName = builderName || "svelte";
		return frontendAuthoringDescriptor(builderName || "svelte", settings, {
			id: "frontbuilder.svelte.builder",
			label: "Svelte builder",
			category: "Svelte / Builders",
			kind: "frontendBuilderDefinition",
			icon: "mdi:application-braces-outline",
			traits: ["definition.frontendBuilder"],
			targetKinds: ["flowEngine", "frontends"],
			acceptedPositions: ["inside"],
			description: "Adds the Svelte frontend builder configuration to this Flow engine.",
			insert: {
				__engineMutationPath: "config.frontbuilder.svelte",
				__engineMutationOp: "merge",
				target: "svelte5",
				resourceRoot: defaultBuilderResourceRoot(builderName, settings, env),
				privateDir: "_private/svelte",
				modelPath: "libs/flow/frontbuilder/svelte/model/SvelteFrontend/src/routes/+page.flow.svelte",
				buildOutput: "DisplayObjects/mobile"
			},
			properties: {
				target: { type: "string", readOnly: true },
				resourceRoot: { type: "string" },
				privateDir: { type: "string" },
				modelPath: { type: "string" },
				buildOutput: { type: "string" }
			}
		});
	}

	function pascalCase(value) {
		return String(value || "")
			.split(/[^A-Za-z0-9]+/)
			.filter(function (part) {
				return !!part;
			})
			.map(function (part) {
				return part.charAt(0).toUpperCase() + part.substring(1);
			})
			.join("")
			.replace(/^[^A-Za-z_]/, "_$&") || "Widget";
	}

	function safePathSegment(value) {
		var segment = String(value || "")
			.replace(/[^A-Za-z0-9_.-]/g, "_")
			.replace(/_+/g, "_")
			.replace(/^[._-]+|[._-]+$/g, "");
		return segment || "svelte";
	}

	function frontendNameParts(id, fallback) {
		var value = String(id || "").trim();
		var fallbackName = String(fallback || "Component").trim() || "Component";
		if (!value) {
			return {
				namespace: "",
				localName: fallbackName
			};
		}
		var parts = value.split(".").filter(function (part) {
			return !!part;
		});
		if (parts.length === 0) {
			return {
				namespace: "",
				localName: fallbackName
			};
		}
		return {
			namespace: parts.slice(0, Math.max(0, parts.length - 1)).join("."),
			localName: parts[parts.length - 1] || fallbackName
		};
	}

	function frontendResourceRoots(builderName, settings, env) {
		var roots = [];
		var seen = {};
		function add(file) {
			if (!file || !file.isDirectory()) {
				return;
			}
			var path = canonicalPath(file);
			if (seen[path]) {
				return;
			}
			seen[path] = true;
			roots.push(file);
		}
		add(projectFrontendRootForSettings(builderName, settings, env));
		add(resourceRootForSettings(settings, env));
		var projectRoot = env.projectDir();
		if (projectRoot) {
			add(resolveFile(projectRoot, defaultBuilderResourceRoot(builderName, settings, env), env));
		}
		return roots;
	}

	function frontendBlocksForSettings(name, settings, env) {
		settings = settings || {};
		var roots = frontendResourceRoots(name, settings, env);
		var projectFrontendRoot = projectFrontendRootForSettings(name, settings, env);
		var out = [];
		var seen = {};
		function addDescriptor(descriptor) {
			if (!descriptor) {
				return;
			}
			var id = String(descriptor.id || "");
			if (id && seen[id]) {
				return;
			}
				if (id) {
					seen[id] = true;
				}
				out.push(descriptor);
			}
		roots.forEach(function (root) {
			var providerHint = rootProvider(root, projectFrontendRoot, name, settings, env);
			var uiFiles = [];
			collectUiBlockFiles(new env.File(root, "ui"), env, uiFiles);
				var componentFiles = [];
				collectSvelteComponentFiles(new env.File(root, "components"), env, componentFiles);
				var actionFiles = [];
				collectSvelteActionFiles(new env.File(root, "actions"), env, actionFiles);
				componentFiles.forEach(function (file) {
					try {
						var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
						addDescriptor(normalizeSvelteComponent(svelteComponentMeta(source, file), file, name, settings, env, providerHint));
					} catch (e) {
						var sourceInfo = sourceMetadataForFile(file, name, env, providerHint);
						addDescriptor({
							id: name + ".invalid." + String(file.getName()).replace(/\.flow\.svelte$|\.svelte$/, ""),
							name: String(file.getName()),
							label: String(file.getName()),
							category: "Svelte / Invalid",
							kind: "error",
							targetKinds: [],
							description: String(e && e.message || e),
							icon: "mdi:alert-outline",
							insert: {},
							builder: name,
							target: settings.target || "",
							provider: sourceInfo.provider,
							sourceBacked: true,
							descriptorKind: "source",
							sourcePath: sourceInfo.sourcePath,
							sourceRelativePath: sourceInfo.sourceRelativePath || "",
							sourceOrigin: sourceInfo.sourceOrigin,
							file: sourceInfo.file,
							sourceWritable: sourceInfo.sourceWritable,
							error: String(e && e.message || e)
						});
					}
				});
				actionFiles.forEach(function (file) {
					try {
						var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
						addDescriptor(normalizeSvelteAction(svelteMeta(source), file, name, settings, env, providerHint));
					} catch (e) {
						var sourceInfo = sourceMetadataForFile(file, name, env, providerHint);
						addDescriptor({
							id: name + ".invalid." + String(file.getName()).replace(/\.svelte\.(js|ts)$/, ""),
							name: String(file.getName()),
							label: String(file.getName()),
							category: "Svelte / Invalid",
							kind: "error",
							targetKinds: [],
							description: String(e && e.message || e),
							icon: "mdi:alert-outline",
							insert: {},
							builder: name,
							target: settings.target || "",
							provider: sourceInfo.provider,
							sourceBacked: true,
							descriptorKind: "source",
							sourcePath: sourceInfo.sourcePath,
							sourceRelativePath: sourceInfo.sourceRelativePath || "",
							sourceOrigin: sourceInfo.sourceOrigin,
							file: sourceInfo.file,
							sourceWritable: sourceInfo.sourceWritable,
							error: String(e && e.message || e)
						});
					}
				});
				uiFiles.forEach(function (file) {
					try {
						var raw = JSON.parse(String(env.FileUtils.readFileToString(file, "UTF-8")));
						addDescriptor(normalizeUiBlock(raw, file, name, settings, env, providerHint));
					} catch (e) {
						var sourceInfo = sourceMetadataForFile(file, name, env, providerHint);
						addDescriptor({
							id: name + ".invalid." + String(file.getName()).replace(/\.uiblock\.json$/, ""),
							name: String(file.getName()),
							label: String(file.getName()),
							category: "Svelte / Invalid",
							kind: "error",
							targetKinds: [],
							description: String(e && e.message || e),
							icon: "mdi:alert-outline",
							insert: {},
							builder: name,
							target: settings.target || "",
							provider: sourceInfo.provider,
							sourceBacked: true,
							descriptorKind: "source",
							sourcePath: sourceInfo.sourcePath,
							sourceRelativePath: sourceInfo.sourceRelativePath || "",
							sourceOrigin: sourceInfo.sourceOrigin,
							file: sourceInfo.file,
							sourceWritable: sourceInfo.sourceWritable,
							error: String(e && e.message || e)
						});
				}
			});
		});
		var modelComponentsDir = modelComponentsDirForSettings(settings, env);
		if (modelComponentsDir && modelComponentsDir.isDirectory()) {
			var providerHint = projectProviderForResourceRoot(modelComponentsDir, env) || currentProjectProvider(env);
			var componentFiles = [];
			collectSvelteComponentFiles(modelComponentsDir, env, componentFiles);
			componentFiles.forEach(function (file) {
				try {
					var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
					addDescriptor(normalizeSvelteComponent(svelteComponentMeta(source, file), file, name, settings, env, providerHint));
				} catch (e) {
					var sourceInfo = sourceMetadataForFile(file, name, env, providerHint);
					addDescriptor({
						id: name + ".invalid." + String(file.getName()).replace(/\.flow\.svelte$|\.svelte$/, ""),
						name: String(file.getName()),
						label: String(file.getName()),
						category: "Svelte / Invalid",
						kind: "error",
						targetKinds: [],
						description: String(e && e.message || e),
						icon: "mdi:alert-outline",
						insert: {},
						builder: name,
						target: settings.target || "",
						provider: sourceInfo.provider,
						sourceBacked: true,
						descriptorKind: "source",
						sourcePath: sourceInfo.sourcePath,
						sourceRelativePath: sourceInfo.sourceRelativePath || "",
						sourceOrigin: sourceInfo.sourceOrigin,
						file: sourceInfo.file,
						sourceWritable: sourceInfo.sourceWritable,
						error: String(e && e.message || e)
					});
				}
			});
		}
		return out;
	}

	function frontendCreateDescriptorsForSettings(name, settings, env) {
		settings = settings || {};
		var authoringSettings = Object.assign({}, settings, {
			provider: currentProjectProvider(env)
		});
		return frontendAuthoringBlocksForSettings(name, authoringSettings, env);
	}

	function frontendBlocksForConfig(config, env) {
		var out = [];
		var entries = frontbuilderSettings(config);
		entries.forEach(function (entry) {
			out = out.concat(frontendBlocksForSettings(entry.name, entry.settings, env));
		});
		return out;
	}

	function frontendCreateDescriptorsForConfig(config, env) {
		var out = [];
		var entries = frontbuilderSettings(config);
		if (entries.length === 0) {
			out.push(frontendBuilderBootstrapDescriptor("svelte", {
				target: "svelte5",
				provider: currentProjectProvider(env)
			}, env));
			return out;
		}
		entries.forEach(function (entry) {
			out = out.concat(frontendCreateDescriptorsForSettings(entry.name, entry.settings, env));
		});
		return out;
	}

	function fingerprintForConfig(config, env) {
		var parts = [];
		frontbuilderSettings(config).forEach(function (entry) {
			parts.push(entry.name);
				frontendResourceRoots(entry.name, entry.settings, env).forEach(function (root) {
					var uiDir = root ? new env.File(root, "ui") : null;
					var componentsDir = root ? new env.File(root, "components") : null;
					var actionsDir = root ? new env.File(root, "actions") : null;
					parts.push(root && root.exists() ? env.canonicalPath(root) : "");
					parts.push(uiDir && uiDir.exists() ? env.directoryFingerprint(uiDir) : "");
					parts.push(componentsDir && componentsDir.exists() ? env.directoryFingerprint(componentsDir) : "");
					parts.push(actionsDir && actionsDir.exists() ? env.directoryFingerprint(actionsDir) : "");
				});
				var modelComponentsDir = modelComponentsDirForSettings(entry.settings, env);
				parts.push(modelComponentsDir && modelComponentsDir.exists() ? env.directoryFingerprint(modelComponentsDir) : "");
			});
		return parts.join("\n");
	}

	function bindingSchemaAtPath(schema, segments) {
		var current = schema;
		(segments || []).forEach(function (segment) {
			if (!current || typeof current !== "object") {
				current = null;
				return;
			}
			if (segment && segment.kind === "index") {
				current = current.type === "array" ? current.items : null;
				return;
			}
			var name = segment && segment.kind === "property" ? String(segment.name || "") : "";
			var properties = current.properties || current;
			current = name && properties && properties[name] || null;
		});
		return current;
	}

	function schemaForBinding(binding, actionSchemas, iterationSchemas) {
		if (!binding || binding.mode !== "source" || !binding.source) {
			return null;
		}
		var source = binding.source;
		var schema = null;
		if (source.category === "requestable" || source.category === "action" || source.category === "fullsync") {
			schema = actionSchemas[String(source.actionId || "")];
		} else if (source.category === "iteration") {
			schema = iterationSchemas[String(source.scopeId || "")];
		}
		return bindingSchemaAtPath(schema, binding.path || []);
	}

	function literalSchema(value) {
		if (value === null || value === undefined) {
			return null;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return {
				type: "array",
				items: value.length ? literalSchema(value[0]) || {} : {}
			};
		}
		if (typeof value === "object") {
			var properties = {};
			Object.keys(value).forEach(function (key) {
				properties[key] = literalSchema(value[key]) || {};
			});
			return { type: "object", properties: properties };
		}
		return { type: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string" };
	}

	function schemaForActionValue(value, actionSchemas, iterationSchemas) {
		if (value && value.mode === "literal") {
			return literalSchema(value.value);
		}
		return schemaForBinding(value, actionSchemas, iterationSchemas);
	}

	function schemaRichness(schema) {
		if (!schema || typeof schema !== "object") {
			return 0;
		}
		var score = schema.type && schema.type !== "unknown" ? 1 : 0;
		if (schema.items) {
			score += schemaRichness(schema.items);
		}
		Object.keys(schema.properties || {}).forEach(function (key) {
			score += 1 + schemaRichness(schema.properties[key]);
		});
		return score;
	}

	function deriveStateActionSchemas(document, actionSchemas, iterationSchemas) {
		var actions = document && document.model && document.model.clientActions || [];
		for (var pass = 0; pass < actions.length + 1; pass++) {
			var changed = false;
			actions.forEach(function (action) {
				if (!action || !action.id || actionSchemas[String(action.id)]) {
					return;
				}
				var schema = null;
				if (action.kind === "updateNumber") {
					schema = { type: "number" };
				} else if (action.kind === "setValue") {
					schema = schemaForActionValue(action.value, actionSchemas, iterationSchemas);
				} else if (action.kind === "updateList") {
					var itemSchema = schemaForActionValue(action.value, actionSchemas, iterationSchemas);
					if (action.operation === "set" && itemSchema && itemSchema.type === "array") {
						schema = itemSchema;
					} else if (itemSchema) {
						schema = { type: "array", items: itemSchema };
					}
				}
				if (!schema) {
					return;
				}
				actionSchemas[String(action.id)] = schema;
				if (action.target) {
					var target = String(action.target);
					if (!actionSchemas[target] || schemaRichness(schema) > schemaRichness(actionSchemas[target])) {
						actionSchemas[target] = schema;
					}
				}
				changed = true;
			});
			if (!changed) {
				break;
			}
		}
	}

	function schemaInfo(schema, env) {
		if (!schema) {
			return null;
		}
		var normalized = env.normalizeTree(schema);
		var leafTypes = {};
		(env.schemaLeafEntries(normalized, "") || []).forEach(function (entry) {
			if (entry && entry.path) {
				leafTypes[String(entry.path)] = String(entry.type || "unknown");
			}
		});
		var arrayPaths = env.schemaArrayPaths(normalized, "") || [];
		var arrays = {};
		arrayPaths.forEach(function (path) { arrays[String(path)] = true; });
		var paths = (env.schemaPaths(normalized, "") || []).map(function (path) {
			path = String(path);
			return {
				path: path,
				type: arrays[path] ? "array" : leafTypes[path] || env.schemaSimpleType(env.schemaAtPath(normalized, path)) || "object"
			};
		});
		return {
			schema: normalized,
			paths: paths,
			arrayPaths: arrayPaths,
			leafPaths: env.schemaLeafEntries(normalized, "") || []
		};
	}

	function bindingPathSegments(path) {
		var segments = [];
		var matcher = /([^.[\]]+)|\[(\d+)\]/g;
		var match;
		while ((match = matcher.exec(String(path || ""))) !== null) {
			segments.push(match[1] !== undefined
				? { kind: "property", name: match[1] }
				: { kind: "index", index: Number(match[2]) });
		}
		return segments;
	}

	function bindingCandidate(source, path, type, mutation, env) {
		var binding = {
			mode: "source",
			source: env.normalizeTree(source || {}),
			path: bindingPathSegments(path)
		};
		var out = {
			path: String(path || ""),
			type: String(type || "unknown"),
			binding: binding
		};
		if (mutation && mutation.path) {
			out.mutation = env.normalizeTree(mutation);
			out.mutation.value = binding;
		}
		return out;
	}

	function walkDocument(value, visitor) {
		if (!value || typeof value !== "object") {
			return;
		}
		visitor(value);
		if (Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) { walkDocument(item, visitor); });
			return;
		}
		Object.keys(value).forEach(function (key) {
			walkDocument(value[key], visitor);
		});
	}

	function enrichBindingSources(document, actionSchemas, env, options) {
		document = env.normalizeTree(document || {});
		actionSchemas = Object.assign({}, actionSchemas || {});
		options = options || {};
		var requestedProperty = String(options.property || "");
		var requestedSourceId = String(options.sourceId || "");
		function sourceId(candidate) {
			var source = candidate && (candidate.source || candidate) || {};
			return String(source.actionId || source.scopeId || candidate && candidate.id || "");
		}
		var iterations = {};
		walkDocument(document, function (node) {
			var props = node.props || {};
			var kind = String(props.kind || node.kind || "");
			if ((kind === "each" || String(node.type || "") === "ForEach") && node.id && props.source) {
				iterations[String(node.id)] = props.source;
			}
		});
		var iterationSchemas = {};
		function resolveIterationSchemas() {
			var pending = Object.keys(iterations).filter(function (id) { return !iterationSchemas[id]; });
			for (var pass = 0; pass < pending.length + 1 && pending.length; pass++) {
				pending = pending.filter(function (id) {
					var schema = schemaForBinding(iterations[id], actionSchemas, iterationSchemas);
					if (!schema) {
						return true;
					}
					iterationSchemas[id] = schema.type === "array" && schema.items ? schema.items : schema;
					return false;
				});
			}
		}
		resolveIterationSchemas();
		deriveStateActionSchemas(document, actionSchemas, iterationSchemas);
		resolveIterationSchemas();
		walkDocument(document, function (node) {
			var definitions = node.propertyDefinitions || {};
			Object.keys(definitions).forEach(function (name) {
				if (requestedProperty && name !== requestedProperty) {
					return;
				}
				var definition = definitions[name];
				var candidates = definition && definition.bindingSources;
				if (Object.prototype.toString.call(candidates) !== "[object Array]") {
					return;
				}
				candidates.forEach(function (candidate) {
					if (requestedSourceId && sourceId(candidate) !== requestedSourceId) {
						return;
					}
					var source = candidate && (candidate.source || candidate) || {};
					var schema = source.category === "iteration"
						? source.value === "index"
							? { type: "integer" }
							: iterationSchemas[String(source.scopeId || candidate.id || "")]
						: actionSchemas[String(source.actionId || candidate.id || "")];
					var info = schemaInfo(schema, env);
					if (!info) {
						return;
					}
					candidate.schema = info.schema;
					candidate.paths = info.paths;
					candidate.arrayPaths = info.arrayPaths;
					candidate.leafPaths = info.leafPaths;
					candidate.binding = {
						mode: "source",
						source: env.normalizeTree(source),
						path: []
					};
					candidate.bindings = info.paths.map(function (entry) {
						return bindingCandidate(source, entry.path, entry.type, candidate.mutation, env);
					});
				});
			});
		});
		return document;
	}

	return {
		frontbuilderSettings: frontbuilderSettings,
			resourceRootForSettings: resourceRootForSettings,
			frontendBlocksForSettings: frontendBlocksForSettings,
			frontendCreateDescriptorsForSettings: frontendCreateDescriptorsForSettings,
			frontendBlocksForConfig: frontendBlocksForConfig,
			frontendCreateDescriptorsForConfig: frontendCreateDescriptorsForConfig,
			fingerprintForConfig: fingerprintForConfig,
			enrichBindingSources: enrichBindingSources
		};
}())
