(function () {
	function stripXmlPrefix(value) {
		var text = String(value || "");
		var index = text.indexOf(":");
		return index === -1 ? text : text.substring(index + 1);
	}

	function xsdScalarType(type) {
		type = stripXmlPrefix(type);
		if (type === "boolean") {
			return { type: "boolean" };
		}
		if (["byte", "short", "int", "integer", "long", "nonNegativeInteger", "positiveInteger"].indexOf(type) !== -1) {
			return { type: "integer" };
		}
		if (["decimal", "double", "float"].indexOf(type) !== -1) {
			return { type: "number" };
		}
		if (["string", "anyURI", "date", "dateTime", "time"].indexOf(type) !== -1) {
			return { type: "string" };
		}
		return null;
	}

	function childElementsByLocalName(node, localName) {
		var out = [];
		var children = node ? node.getChildNodes() : null;
		for (var i = 0; children && i < children.getLength(); i++) {
			var child = children.item(i);
			if (child.getNodeType && child.getNodeType() === 1 &&
					String(child.getLocalName ? child.getLocalName() : stripXmlPrefix(child.getNodeName())) === localName) {
				out.push(child);
			}
		}
		return out;
	}

	function descendantElementsByLocalName(node, localName) {
		var out = [];
		var children = node ? node.getChildNodes() : null;
		for (var i = 0; children && i < children.getLength(); i++) {
			var child = children.item(i);
			if (!child.getNodeType || child.getNodeType() !== 1) {
				continue;
			}
			if (String(child.getLocalName ? child.getLocalName() : stripXmlPrefix(child.getNodeName())) === localName) {
				out.push(child);
			}
			descendantElementsByLocalName(child, localName).forEach(function (match) {
				out.push(match);
			});
		}
		return out;
	}

	function attr(node, name) {
		return node && node.hasAttribute && node.hasAttribute(name) ? String(node.getAttribute(name)) : "";
	}

	function xsdAttributesSchema(complexType) {
		var attributes = descendantElementsByLocalName(complexType, "attribute");
		var properties = {};
		attributes.forEach(function (attribute) {
			var name = attr(attribute, "name");
			if (!name) {
				return;
			}
			properties[name] = xsdScalarType(attr(attribute, "type")) || { type: "string" };
		});
		return Object.keys(properties).length ? { type: "object", properties: properties } : null;
	}

	function xsdElementSchema(element, complexTypes, stack, env) {
		var type = attr(element, "type");
		var schema = xsdScalarType(type);
		if (!schema && type) {
			schema = xsdComplexTypeSchema(complexTypes[stripXmlPrefix(type)], complexTypes, stack, env);
		}
		if (!schema) {
			var inlineComplex = childElementsByLocalName(element, "complexType")[0];
			schema = inlineComplex ? xsdComplexTypeSchema(inlineComplex, complexTypes, stack, env) : { type: "unknown" };
		}
		var maxOccurs = attr(element, "maxOccurs");
		if (maxOccurs === "unbounded" || Number(maxOccurs || 1) > 1) {
			schema = { type: "array", items: schema };
		}
		return schema;
	}

	function xsdComplexTypeSchema(complexType, complexTypes, stack, env) {
		if (!complexType) {
			return null;
		}
		var name = attr(complexType, "name");
		stack = stack || {};
		if (name && stack[name]) {
			return { type: "object" };
		}
		if (name) {
			stack[name] = true;
		}
		var properties = {};
		var sequence = childElementsByLocalName(complexType, "sequence")[0];
		if (sequence) {
			childElementsByLocalName(sequence, "element").forEach(function (element) {
				var elementName = attr(element, "name");
				if (!elementName) {
					return;
				}
				properties[elementName] = env.mergeSchema(properties[elementName],
					xsdElementSchema(element, complexTypes, stack, env));
			});
		}
		var simpleContent = childElementsByLocalName(complexType, "simpleContent")[0];
		if (simpleContent) {
			var extension = childElementsByLocalName(simpleContent, "extension")[0];
			properties.text = xsdScalarType(attr(extension, "base")) || { type: "string" };
		}
		var attrs = xsdAttributesSchema(complexType);
		if (attrs) {
			properties.attr = attrs;
		}
		if (name) {
			delete stack[name];
		}
		return Object.keys(properties).length ? { type: "object", properties: properties } : { type: "unknown" };
	}

	function learnedXsdOutputSchema(target, env) {
		var root = env.projectDir();
		if (!root || !target || !target.project || !target.connector || !target.requestable) {
			return null;
		}
		if (String(new env.File(root).getName()) !== String(target.project)) {
			return null;
		}
		var file = new env.File(root, "xsd/internal/" + target.connector + "/" + target.requestable + ".xsd");
		if (!file.isFile()) {
			return null;
		}
		try {
			var factory = Packages.javax.xml.parsers.DocumentBuilderFactory.newInstance();
			factory.setNamespaceAware(true);
			var document = factory.newDocumentBuilder().parse(file);
			var complexTypes = {};
			descendantElementsByLocalName(document.getDocumentElement(), "complexType").forEach(function (complexType) {
				var name = attr(complexType, "name");
				if (name) {
					complexTypes[name] = complexType;
				}
			});
			var responseDataName = target.connector + "__" + target.requestable + "ResponseData";
			return xsdComplexTypeSchema(complexTypes[responseDataName], complexTypes, {}, env);
		} catch (e) {
			return null;
		}
	}

	function outputSchema(target, env) {
		target = target || {};
		var projectName = String(target.project || "").trim();
		var connectorName = String(target.connector || "").trim();
		var requestableName = String(target.requestable || target.sequence || target.transaction || "").trim();
		if (!projectName || !requestableName) {
			return null;
		}
		try {
			var qname = projectName + "." + (connectorName ? connectorName + "." : "") + requestableName;
			var dbo = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(qname);
			if (!dbo) {
				return null;
			}
			var className = String(dbo.getClass().getName());
			if (className === "com.twinsoft.convertigo.beans.flow.Flow") {
				return env.withProjectDir(String(dbo.getProject().getDirPath()), function () {
					var blocks = env.loadBlocks();
					var request = {
						name: String(dbo.getName()),
						flowName: String(dbo.getName()),
						flowSource: String(dbo.getFlowSource())
					};
					var definition = env.parseSource(env.sourceForFlowRequest(request, blocks));
					return env.objectSchema(env.declaredOutputSchema(definition) || env.readResultSchema(request, definition) || {});
				});
			}
			var learnedSchema = learnedXsdOutputSchema(target, env);
			if (learnedSchema) {
				return learnedSchema;
			}
			var project = dbo.getProject();
			var schema = Packages.com.twinsoft.convertigo.engine.Engine.theApp.schemaManager.getSchemaForProject(project.getName());
			var xso = Packages.com.twinsoft.convertigo.engine.enums.SchemaMeta.getXmlSchemaObject(schema, dbo);
			if (!xso) {
				return null;
			}
			var document = Packages.com.twinsoft.convertigo.engine.util.XmlSchemaUtils.getDomInstance(xso);
			var jsonString = Packages.com.twinsoft.convertigo.engine.util.XMLUtils.XmlToJson(document.getDocumentElement(), true, true);
			var sample = JSON.parse(String(jsonString));
			var responseName = String(dbo.getXsdTypePrefix()) + String(dbo.getName()) + "Response";
			var output = env.readObjectPath(sample, "document." + responseName + ".response");
			if (output === undefined) {
				output = sample;
			}
			return env.unwrapDocumentSchema(env.inferSchema(output));
		} catch (e) {
			return learnedXsdOutputSchema(target, env);
		}
	}

	function targetQName(target) {
		target = target || {};
		return target.project + "." + (target.connector ? target.connector + "." : "") + target.requestable;
	}

	function targetPublic(target, currentProject) {
		var qname = targetQName(target);
		var local = target.project === currentProject
			? "." + (target.connector ? target.connector + "." : "") + target.requestable
			: qname;
		var out = {
			kind: target.kind,
			project: target.project,
			name: target.requestable,
			qname: qname,
			requestable: qname,
			localRequestable: local
		};
		if (target.connector) {
			out.connector = target.connector;
		}
		return out;
	}

	function flowScriptHints(target, arrays, leaves, currentProject, env) {
		var publicTarget = targetPublic(target, currentProject);
		var requestable = publicTarget.localRequestable || publicTarget.requestable || publicTarget.qname || "";
		var hints = {
			call: "const data = requestable.call(" + JSON.stringify(requestable) + ");"
		};
		var arrayPath = (arrays || []).filter(function (path) {
			return String(path).indexOf(".attr") === -1;
		})[0] || (arrays || [])[0] || "";
		if (!arrayPath) {
			hints.returnObject = "return data;";
			return hints;
		}
		hints.array = "const items = " + env.flowScriptPath("data", arrayPath) + ";";
		var leaf = (leaves || []).filter(function (entry) {
			return String(entry.path).indexOf(arrayPath + ".") === 0 && /(^|\.)title$/.test(String(entry.path));
		})[0] || (leaves || []).filter(function (entry) {
			return String(entry.path).indexOf(arrayPath + ".") === 0 && ["name", "label"].some(function (suffix) {
				return new RegExp("(^|\\.)" + suffix + "$").test(String(entry.path));
			});
		})[0] || (leaves || []).filter(function (entry) {
			return String(entry.path).indexOf(arrayPath + ".") === 0 && entry.type === "string";
		})[0];
		if (leaf) {
			var relative = String(leaf.path).substring(arrayPath.length + 1);
			hints.sort = "const sorted = list.sort(items, { by: " + env.flowScriptPath("current", relative) + ", direction: \"asc\" });";
		}
		hints.returnObject = "return { items, count: items.length };";
		return hints;
	}

	function targetCandidates(request, targetText, env) {
		request = request || {};
		var project = env.currentProjectName(request);
		var text = String(targetText || "").trim();
		if (text.charAt(0) === ".") {
			text = project + text;
		}
		var parts = text.split(".").filter(function (part) {
			return part !== "";
		});
		var candidates = [];
		if (parts.length >= 3) {
			candidates.push({
				kind: "transaction",
				project: parts.slice(0, parts.length - 2).join("."),
				connector: parts[parts.length - 2],
				requestable: parts[parts.length - 1],
				transaction: parts[parts.length - 1]
			});
		} else if (parts.length === 2) {
			candidates.push({
				kind: "sequence",
				project: parts[0],
				requestable: parts[1],
				sequence: parts[1]
			});
		} else if (parts.length === 1 && project) {
			candidates.push({
				kind: "sequence",
				project: project,
				requestable: parts[0],
				sequence: parts[0]
			});
		}
		return candidates;
	}

	function kindForDbo(dbo, candidate) {
		var className = String(dbo.getClass().getName());
		if (className.indexOf(".transactions.") !== -1 || className.indexOf(".beans.core.Transaction") !== -1) {
			candidate.kind = "transaction";
			candidate.connector = candidate.connector || String(dbo.getConnector().getName());
			candidate.transaction = candidate.requestable;
			return candidate;
		}
		if (className === "com.twinsoft.convertigo.beans.flow.Flow") {
			candidate.kind = "flow";
			delete candidate.connector;
			candidate.sequence = candidate.requestable;
			return candidate;
		}
		if (className === "com.twinsoft.convertigo.beans.core.Sequence" || className.indexOf(".beans.sequences.") !== -1) {
			candidate.kind = "sequence";
			delete candidate.connector;
			candidate.sequence = candidate.requestable;
			return candidate;
		}
		return null;
	}

	function resolveTarget(request, targetText, env) {
		var candidates = targetCandidates(request, targetText, env);
		for (var i = 0; i < candidates.length; i++) {
			try {
				var dbo = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager
					.getDatabaseObjectByQName(targetQName(candidates[i]));
				if (!dbo) {
					continue;
				}
				if (String(dbo.getProject().getName()) !== String(candidates[i].project)) {
					continue;
				}
				try {
					if (candidates[i].connector && String(dbo.getConnector().getName()) !== String(candidates[i].connector)) {
						continue;
					}
				} catch (e) {
					if (candidates[i].connector) {
						continue;
					}
				}
				var resolved = kindForDbo(dbo, candidates[i]);
				if (resolved) {
					return resolved;
				}
			} catch (e) {
			}
		}
		return null;
	}

	function matches(entry, query) {
		query = String(query || "").trim().toLowerCase();
		if (!query) {
			return true;
		}
		var haystack = [
			entry.kind,
			entry.project,
			entry.connector || "",
			entry.name,
			entry.qname,
			entry.localRequestable || ""
		].join(" ").toLowerCase();
		return query.split(/\s+/).filter(function (token) {
			return token !== "";
		}).every(function (token) {
			return haystack.indexOf(token) !== -1;
		});
	}

	function list(request, env) {
		request = request || {};
		var projectName = env.currentProjectName(request);
		if (!projectName) {
			return {
				ok: false,
				error: env.flowCodeError("MISSING_PROJECT", "requestable.list requires project or context.project.",
					"Pass the current project name.")
			};
		}
		var limit = Math.max(1, Math.min(500, Number(request.limit || 100)));
		var query = String(request.query || request.q || "").trim();
		var dbom = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
		var project = dbom.getOriginalProjectByName(projectName, false);
		var requestables = [];
		var sequenceIterator = project.getSequencesList().iterator();
		while (sequenceIterator.hasNext()) {
			var sequence = sequenceIterator.next();
			var sequenceClass = String(sequence.getClass().getName());
			requestables.push(targetPublic({
				kind: sequenceClass === "com.twinsoft.convertigo.beans.flow.Flow" ? "flow" : "sequence",
				project: projectName,
				requestable: String(sequence.getName())
			}, projectName));
		}
		var connectorIterator = project.getConnectorsList().iterator();
		while (connectorIterator.hasNext()) {
			var connector = connectorIterator.next();
			var transactionIterator = connector.getTransactionsList().iterator();
			while (transactionIterator.hasNext()) {
				var transaction = transactionIterator.next();
				requestables.push(targetPublic({
					kind: "transaction",
					project: projectName,
					connector: String(connector.getName()),
					requestable: String(transaction.getName()),
					transaction: String(transaction.getName())
				}, projectName));
			}
		}
		requestables = requestables.filter(function (entry) {
			return matches(entry, query);
		}).slice(0, limit);
		return {
			ok: true,
			project: projectName,
			count: requestables.length,
			requestables: requestables
		};
	}

	function schema(request, env) {
		request = request || {};
		var text = request.requestable || request.target || request.qname || request.name || "";
		if (!text) {
			return {
				ok: false,
				error: env.flowCodeError("MISSING_REQUESTABLE", "requestable.schema requires requestable.",
					"Pass for example .RSSConnector.GetFeed, .MyFlow or Project.Connector.Transaction.")
			};
		}
		var target = resolveTarget(request, text, env);
		if (!target || !target.project || !target.requestable) {
			return {
				ok: false,
				error: env.flowCodeError("UNKNOWN_REQUESTABLE", "Unknown requestable: " + text,
					"Call requestable.list first and reuse one returned qname or localRequestable. Current-project requestables start with a dot.")
			};
		}
		var output = outputSchema(target, env);
		var learned = false;
		var sample;
		if (!output && request.learn === true) {
			sample = sampleOutput(target, request.input || {}, env);
			output = env.unwrapDocumentSchema(env.inferSchema(sample));
			learned = true;
		}
		if (!output) {
			return {
				ok: false,
				target: targetPublic(target, env.currentProjectName(request)),
				error: env.flowCodeError("REQUESTABLE_SCHEMA_UNAVAILABLE", "No schema available for requestable: " + text,
					"Run or learn the requestable schema in Studio, or retry with learn:true when executing the requestable is safe.")
			};
		}
		output = env.objectSchema(output);
		var paths = env.schemaPaths(output, "");
		var arrayPaths = env.schemaArrayPaths(output, "");
		var leafPaths = env.schemaLeafEntries(output, "");
		var out = {
			ok: true,
			target: targetPublic(target, env.currentProjectName(request)),
			learned: learned,
			schema: output,
			paths: paths,
			arrayPaths: arrayPaths,
			leafPaths: leafPaths,
			flowScript: flowScriptHints(target, arrayPaths, leafPaths, env.currentProjectName(request), env)
		};
		if (request.includeSample === true) {
			out.sample = sample;
		}
		return out;
	}

	function sampleOutput(target, input, env) {
		if (!env.context) {
			env.raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "requestable.schema learn:true needs a live Convertigo context.");
		}
		var request = new Packages.java.util.HashMap();
		request.put("__project", target.project);
		if (target.kind === "transaction") {
			request.put("__connector", target.connector);
			request.put("__transaction", target.transaction || target.requestable);
		} else {
			request.put("__sequence", target.sequence || target.requestable);
		}
		Object.keys(input || {}).forEach(function (key) {
			var value = input[key];
			request.put(String(key), value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value));
		});
		var doc = new Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester(request, env.context.httpServletRequest).processRequest();
		var raw = JSON.parse(String(Packages.com.twinsoft.convertigo.engine.util.XMLUtils.XmlToJson(doc.getDocumentElement(), true)));
		return raw && raw.document !== undefined ? raw.document : raw;
	}

	return {
		outputSchema: outputSchema,
		targetQName: targetQName,
		targetPublic: targetPublic,
		list: list,
		schema: schema,
		sampleOutput: sampleOutput
	};
})();
