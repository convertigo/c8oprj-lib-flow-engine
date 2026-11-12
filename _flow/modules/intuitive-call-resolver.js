(function () {
	// An agent writes FlowScript as JavaScript first: Object.assign({}, a, b), JSON.stringify(x), Date.now(),
	// console.log(m), a block name it guesses (smtp.send, crypto.md5, text.trimm), keys it guesses
	// (order for direction) or positional arguments. The resolver maps each such call onto the catalog, as one global
	// patch of the whole source:
	//   edits: [{ oldText, newText, line, confidence, reason, block }]
	// in source order, each oldText found exactly once in the source as the edits before it left it (the edits form of
	// code-patch), and unresolved: [{ line, call, reason }] for the calls it has no mapping for. It writes nothing:
	// code-set returns these edits as suggestions. Source is never changed automatically.
	//
	// confidence = name confidence x argument fit, both in 0..1:
	// - name: 1 for an existing block; for a JavaScript global, the confidence of its equivalent (below the threshold
	//   when the equivalent does not behave the same in every case); for a guessed name, the scorer's confidence
	//   (under 0.5: not proposed), +0.1 when two keys or more are all properties of the block;
	// - argument fit: the lowest of its arguments: by name (exact 1, a synonym 0.92, or 0.8 when the contract has
	//   several, a near spelling 0.9/0.82), by type and kind for positional arguments (0.95 when one assignment only
	//   fits, 0.9 when one fits clearly better), by the order of the contract when several fit as well (ambiguous:
	//   0.75 at most); every literal is checked against the type and the allowed values of its property.
	// Never applied, whatever the threshold (0.8 at least), all at 0.75 at most: an ambiguous choice (two blocks or
	// two assignments as likely), a block of another namespace than the one written (invoice.send may be a domain
	// block to create, not email.send), a block produced inside a condition (the corrections cannot lift it).

	var DEFAULT_THRESHOLD = 0.9;
	var LOWEST_THRESHOLD = 0.8;
	var AMBIGUOUS = 0.75;
	var SCOPES = /^(input|local|current|result|request|config|trace|session|item|props)$/;
	// The functions of the expressions (expression-utils.js): not blocks, nothing to resolve
	var EXPRESSION_FUNCTIONS = {
		lower: "string", upper: "string", trim: "string", contains: "boolean", startsWith: "boolean", endsWith: "boolean",
		length: "number", "list.length": "number", "text.repeat": "string", round: "number", floor: "number", ceil: "number", abs: "number",
		min: "number", max: "number", "Math.round": "number", "Math.floor": "number", "Math.ceil": "number",
		"Math.abs": "number", "Math.min": "number", "Math.max": "number", "default": "any", json: "string",
		oneOf: "boolean", overlaps: "boolean", String: "string", Number: "number", "Array.isArray": "boolean",
		parseInt: "number", parseFloat: "number", isNaN: "boolean", isFinite: "boolean", "Number.parseInt": "number",
		"Number.parseFloat": "number", "Number.isNaN": "boolean", "Number.isFinite": "boolean", "Number.isInteger": "boolean"
	};
	["sqrt", "cbrt", "pow", "exp", "log", "log2", "log10", "trunc", "sign", "hypot", "sin", "cos", "tan", "asin", "acos",
		"atan", "atan2"].forEach(function (name) { EXPRESSION_FUNCTIONS["Math." + name] = "number"; });

	// The keys an author writes for a property of another name, the most likely first
	var KEY_SYNONYMS = {
		body: ["text", "html"], content: ["text", "html", "value"], message: ["message", "text"], msg: ["message", "text"],
		str: ["text", "value"], string: ["text", "value"], value: ["value", "text", "source"], val: ["value", "text"],
		list: ["items"], array: ["items"], arr: ["items"], rows: ["items"], values: ["items"], elements: ["items"],
		obj: ["source", "value"], object: ["source", "value"], data: ["data", "value", "items"],
		key: ["by", "key"], field: ["by", "field"], sortby: ["by"], orderby: ["by"], order: ["direction"], dir: ["direction"],
		pattern: ["search", "pattern"], find: ["search"], replace: ["replacement"], replacewith: ["replacement"], "with": ["replacement"],
		uri: ["url"], endpoint: ["url"], link: ["url"], recipient: ["to"], recipients: ["to"], email: ["to"], title: ["subject"],
		algo: ["algorithm"], hash: ["algorithm"], digest: ["algorithm"], enc: ["encoding"],
		sep: ["separator"], delimiter: ["separator"], delim: ["separator"], defaultvalue: ["fallback"], severity: ["level"]
	};

	// The namespaces an author writes for a namespace of the catalog
	var NAMESPACE_ALIASES = {
		str: "text", string: "text", strings: "text", txt: "text", array: "list", arr: "list", arrays: "list", lists: "list",
		collection: "list", obj: "object", objects: "object", hash: "crypto", hashes: "crypto", digest: "crypto",
		mail: "email", mailer: "email", smtp: "email", time: "date", datetime: "date", dates: "date", num: "number",
		math: "number", fetch: "http", net: "http", rest: "http", fs: "file", files: "file", jsn: "json", yml: "yaml",
		tpl: "template", templates: "template"
	};
	// The block names an author writes for a block of another name
	var LOCAL_ALIASES = {
		assign: ["merge"], extend: ["merge"], sorted: ["sort"], sortby: ["sort"], orderby: ["sort"], len: ["count"],
		size: ["count"], digest: ["hash"], checksum: ["hash"], strip: ["trim"], where: ["filter"], unique: ["distinct"],
		uniq: ["distinct"], groupby: ["group"], head: ["first"], total: ["sum"], encodeuricomponent: ["urlEncode"],
		urlencode: ["urlEncode"], mail: ["send"], tostring: ["stringify"], serialize: ["stringify"], deserialize: ["parse"]
	};
	// A namespaced spelling of an expression function: text.lower(x) is lower(x)
	var EXPRESSION_ALIASES = {
		text: { lower: "lower", tolowercase: "lower", tolower: "lower", lowercase: "lower", upper: "upper", touppercase: "upper",
			toupper: "upper", uppercase: "upper", includes: "contains", contains: "contains", startswith: "startsWith", endswith: "endsWith" },
		number: { round: "round", floor: "floor", ceil: "ceil", abs: "abs", min: "min", max: "max" }
	};

	// The namespace of the catalog a written namespace stands for: itself, an alias or a near spelling
	function relatedNamespace(written, namespace) {
		written = String(written || "").toLowerCase(); namespace = String(namespace || "").toLowerCase();
		if (!written || !namespace) return false;
		return written === namespace || NAMESPACE_ALIASES[written] === namespace
			|| distance(written, namespace) === 1 && Math.min(written.length, namespace.length) >= 3;
	}

	function kind(node) { return node ? String(node.getClass().getSimpleName()) : ""; }
	function list(value) {
		var out = [];
		for (var i = 0; value && i < value.size(); i++) out.push(value.get(i));
		return out;
	}
	function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
	function round2(value) { return Math.round(value * 100) / 100; }
	function identifierKey(key) { return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key); }
	function operator(node) { return String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(node.getOperator())); }
	function tokens(value) {
		return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/)
			.filter(function (token) { return token.length > 1; });
	}

	// Damerau-Levenshtein (optimal string alignment): one typo, a missing, doubled or swapped letter, counts 1
	function distance(a, b) {
		a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
		if (a === b) return 0;
		if (Math.abs(a.length - b.length) > 3) return 9;
		var rows = [], i, j;
		for (i = 0; i <= a.length; i++) { rows[i] = [i]; }
		for (j = 0; j <= b.length; j++) { rows[0][j] = j; }
		for (i = 1; i <= a.length; i++) {
			for (j = 1; j <= b.length; j++) {
				var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
				rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
				if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
					rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
				}
			}
		}
		return rows[a.length][b.length];
	}
	function nearSpelling(wanted, name) {
		var d = distance(wanted, name), length = Math.min(String(wanted).length, String(name).length);
		return d === 1 && length >= 4 || d === 2 && length >= 6 ? d : 0;
	}

	/**
	 * The text scorer: the candidate score of an unknown block (flowscript-intent-utils: names, namespaces, tags,
	 * properties, descriptions), plus a near spelling of the name and the allowed values of the properties (crypto.md5
	 * names the md5 algorithm of crypto.hash). An embedding scorer can replace it (options.scorer) with the same contract:
	 *   rank(wanted, context) -> [{ block, score, confidence }], best first, confidence of the name alone in 0..1;
	 *   context: { names: candidate block names, descriptor(name) -> { blockId, namespace, localName, tags, props,
	 *   description } }.
	 */
	function textScorer(env) {
		function enumValues(descriptor) {
			var values = [];
			Object.keys(descriptor.props || {}).forEach(function (key) {
				(descriptor.props[key] && descriptor.props[key]["enum"] || []).forEach(function (value) { values.push(String(value).toLowerCase()); });
			});
			return values;
		}
		return {
			name: "text",
			rank: function (wanted, context) {
				var wantedText = String(wanted || ""), dot = wantedText.lastIndexOf(".");
				var wantedLocal = dot >= 0 ? wantedText.substring(dot + 1) : wantedText;
				var wantedNamespace = dot >= 0 ? wantedText.substring(0, dot) : "";
				var wantedTokens = tokens(wantedLocal);
				var aliases = LOCAL_ALIASES[wantedLocal.toLowerCase()] || [];
				var ranked = [];
				context.names.forEach(function (name) {
					var descriptor = context.descriptor(name);
					if (!descriptor) return;
					var score = Number(env.blockCandidateScore(descriptor, wantedText) || 0);
					var local = String(descriptor.localName || name), namespace = String(descriptor.namespace || "");
					var sameDomain = !wantedNamespace || relatedNamespace(wantedNamespace, namespace);
					if (wantedNamespace && namespace !== wantedNamespace && sameDomain) score += 60;
					var near = nearSpelling(wantedLocal, local);
					if (near && sameDomain) score += near === 1 ? 70 : 45;
					if (aliases.indexOf(local) >= 0) score += 55;
					var values = enumValues(descriptor);
					wantedTokens.forEach(function (token) {
						if (values.indexOf(token) >= 0) score += 80;
					});
					if (score > 0) ranked.push({ block: String(descriptor.blockId || name), score: score });
				});
				ranked.sort(function (a, b) { return b.score - a.score || (a.block < b.block ? -1 : a.block > b.block ? 1 : 0); });
				var first = null;
				return ranked.slice(0, 5).map(function (candidate, index) {
					var next = ranked[index + 1];
					// how strong (a name, its namespace and a word of the description reach 180) and how far ahead of the next
					var strength = Math.min(1, candidate.score / 180);
					var margin = next ? (candidate.score - next.score) / Math.max(1, candidate.score) : 1;
					var confidence = index === 0 ? strength * (margin >= 0.25 ? 1 : 0.6 + 1.6 * margin)
						: Math.min(first, strength * candidate.score / Math.max(1, ranked[0].score));
					if (index === 0) first = confidence;
					return { block: candidate.block, score: candidate.score, confidence: round2(confidence) };
				});
			}
		};
	}

	// The JavaScript globals with a FlowScript equivalent. Each returns { text, confidence, reason, block } or
	// { unresolved: reason }; a confidence below the threshold says the equivalent can behave differently.
	function globalRewrites() {
		function block(R, name, props, confidence, reason) {
			if (!R.blockExists(name)) return { unresolved: name + " is not in the catalog of this project." };
			return { text: R.blockCall(name, props), confidence: confidence, reason: reason, block: name };
		}
		function console(level) {
			return function (R, args) {
				if (!args.length || args.length > 2) return { unresolved: "log takes one message and one data value; join the values first." };
				var props = [];
				if (level) props.push(["level", JSON.stringify(level)]);
				props.push(["message", R.text(args[0])]);
				if (args.length > 1) props.push(["data", R.text(args[1])]);
				return block(R, "log", props, 0.9, "console." + (level || "log") + " is the log block" + (level ? " at level " + level : "") + ".");
			};
		}
		var table = {
			"Object.assign": function (R, args, call) {
				if (args.length < 2 || args.length > 3) return { unresolved: "object.merge merges two objects; merge them two by two." };
				var fresh = R.kind(args[0]) === "ObjectLiteral" && !list(args[0].getElements()).length;
				if (fresh && args.length === 3) {
					return block(R, "object.merge", [["target", R.text(args[1])], ["source", R.text(args[2])]], 0.95,
						"Object.assign({}, a, b) is object.merge, a new shallow merge.");
				}
				if (fresh) {
					return block(R, "object.merge", [["target", "{}"], ["source", R.text(args[1])]], 0.95,
						"Object.assign({}, a) is a shallow copy: object.merge of an empty object.");
				}
				if (args.length === 3) return { unresolved: "Object.assign(a, b, c) changes a in place: merge with object.merge two by two." };
				var parent = call.getParent();
				var merge = R.blockCall("object.merge", [["target", R.text(args[0])], ["source", R.text(args[1])]]);
				if (!R.blockExists("object.merge")) return { unresolved: "object.merge is not in the catalog of this project." };
				if (R.kind(parent) === "ExpressionStatement" && R.info(args[0]).path) {
					return { text: R.text(args[0]) + " = " + merge, confidence: 0.9, block: "object.merge",
						reason: "Object.assign(a, b) merges b into a: a = object.merge, a new shallow merge given back to a." };
				}
				return { text: merge, confidence: 0.85, block: "object.merge",
					reason: "Object.assign(a, b) also changes a in place; object.merge returns the merge and leaves a unchanged." };
			},
			"Object.keys": function (R, args) {
				return args.length === 1 ? block(R, "object.keys", [["source", R.text(args[0])]], 0.95, "Object.keys is the object.keys block.")
					: { unresolved: "Object.keys takes one object." };
			},
			"Object.values": function (R, args) {
				return args.length === 1 ? block(R, "object.values", [["source", R.text(args[0])]], 0.95, "Object.values is the object.values block.")
					: { unresolved: "Object.values takes one object." };
			},
			"Object.entries": function () { return { unresolved: "No entries block: object.keys, then object.get for each key." }; },
			"JSON.stringify": function (R, args) {
				if (args.length === 1) return block(R, "json.stringify", [["value", R.text(args[0])]], 0.95, "JSON.stringify is the json.stringify block.");
				if (args.length === 3 && R.text(args[1]) === "null") {
					return block(R, "json.stringify", [["value", R.text(args[0])], ["pretty", "true"]], 0.9,
						"JSON.stringify(value, null, indent) is json.stringify with pretty: true (its own indentation).");
				}
				return { unresolved: "json.stringify takes no replacer." };
			},
			"JSON.parse": function (R, args) {
				return args.length === 1 ? block(R, "json.parse", [["text", R.text(args[0])]], 0.95, "JSON.parse is the json.parse block (json.safeParse gives an error instead of a failure).")
					: { unresolved: "json.parse takes no reviver." };
			},
			"Date.now": function (R, args) {
				return args.length === 0 ? block(R, "date.now", [], 0.95, "Date.now() is date.now({}), Unix milliseconds.")
					: { unresolved: "Date.now takes no argument." };
			},
			"encodeURIComponent": function (R, args) {
				return args.length === 1 ? block(R, "text.urlEncode", [["text", R.text(args[0])]], 0.95, "encodeURIComponent is the text.urlEncode block.")
					: { unresolved: "encodeURIComponent takes one value." };
			},
			"Math.random": function () { return { unresolved: "No random number in the expressions: crypto.random gives a random text (bytes, encoding)." }; },
			"console.log": console(""),
			"console.info": console("info"),
			"console.warn": console("warn"),
			"console.error": console("error"),
			"console.debug": console("debug")
		};
		return table;
	}

	function expressionAlias(name) {
		var dot = String(name).lastIndexOf(".");
		if (dot <= 0) return "";
		var namespace = String(name).substring(0, dot).toLowerCase(), local = String(name).substring(dot + 1).toLowerCase();
		var domain = namespace === "text" || NAMESPACE_ALIASES[namespace] === "text" ? "text"
			: namespace === "number" || NAMESPACE_ALIASES[namespace] === "number" ? "number" : "";
		return domain && EXPRESSION_ALIASES[domain][local] || "";
	}

	function resolve(blocks, source, options, env) {
		source = String(source || "");
		options = options || {};
		blocks = blocks || {};
		var threshold = normalizedThreshold(options.threshold);
		var catalogs = Object.create(null), descriptors = Object.create(null);
		var scorer = options.scorer || env.scorer || textScorer(env);
		var rewrites = globalRewrites();
		var empty = { threshold: threshold, scorer: scorer.name || "custom", edits: [], unresolved: [] };
		if (!source.trim()) return empty;
		var ast = parse(source);
		if (!ast) return empty;

		// A node starts at its leftmost token: Rhino bounds !x, -x or typeof x by x alone (sourceStart of the parser), and
		// ends at its last: Rhino bounds null, true, false or this by the next token too (sourceEnd of the parser)
		function start(node) { return env.sourceStart(node, source); }
		function end(node) { return env.sourceEnd ? env.sourceEnd(node, source) : Number(node.getAbsolutePosition()) + Number(node.getLength()); }
		function text(node) { return source.substring(start(node), end(node)); }
		function line(offset) { return source.substring(0, offset).split(/\r\n|\r|\n/).length; }
		function catalog(name) {
			if (!has(catalogs, name)) catalogs[name] = blocks[name] ? env.blockCatalog(blocks[name]) || {} : {};
			return catalogs[name];
		}
		function descriptor(name) {
			if (!has(descriptors, name)) {
				var value = null;
				try { value = env.blockDescriptor(blocks[name]); } catch (_noDescriptor) { value = null; }
				// a private block of a library is not part of the vocabulary of the projects using it
				if (value && value.visibility === "private" && value.origin !== "project") value = null;
				descriptors[name] = value;
			}
			return descriptors[name];
		}
		function visibleKeys(name) {
			var props = catalog(name).props || {};
			return Object.keys(props).filter(function (key) { return !props[key].hidden && !/^\$\$/.test(key); });
		}
		function dottedName(node) {
			var k = kind(node);
			if (k === "Name") return String(node.getIdentifier());
			if (k === "PropertyGet") {
				var left = dottedName(node.getTarget());
				return left ? left + "." + String(node.getProperty().getIdentifier()) : "";
			}
			return "";
		}
		function readsCurrent(node) {
			var found = false;
			node.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (child) {
				if (kind(child) === "FunctionNode") return false;
				if (kind(child) === "Name" && String(child.getIdentifier()) === "current") found = true;
				return !found;
			} }));
			return found;
		}
		function jsonType(type) {
			type = String(type || "");
			return type === "integer" ? "number" : /^(string|number|boolean|array|object)$/.test(type) ? type : type === "requestable" ? "string" : "any";
		}
		function info(node) {
			var k = kind(node), out = { type: "any" };
			if (k === "ParenthesizedExpression") return info(node.getExpression());
			if (k === "StringLiteral") out = { type: "string", literal: true, value: String(node.getValue()) };
			else if (k === "NumberLiteral") out = { type: "number", literal: true, value: Number(node.getNumber()) };
			else if (k === "UnaryExpression" && kind(node.getOperand()) === "NumberLiteral" && /^[-+]/.test(text(node))) out = { type: "number", literal: true, value: Number(text(node).replace(/\s/g, "")) };
			else if (k === "KeywordLiteral") {
				var keyword = text(node);
				out = keyword === "true" || keyword === "false" ? { type: "boolean", literal: true, value: keyword === "true" }
					: keyword === "null" ? { type: "any", literal: true, value: null } : { type: "any" };
			}
			else if (k === "ObjectLiteral") out = { type: "object" };
			else if (k === "ArrayLiteral") out = { type: "array" };
			else if (k === "Name" || k === "PropertyGet" || k === "ElementGet") out = { type: "any", path: true };
			else if (k === "FunctionCall") {
				var name = dottedName(node.getTarget());
				var outputs = blocks[name] ? catalog(name).outputs || {} : null;
				out = { type: outputs ? jsonType((outputs.out || outputs).type) : has(EXPRESSION_FUNCTIONS, name) ? EXPRESSION_FUNCTIONS[name] : "any" };
			}
			else if (k === "InfixExpression") {
				var op = operator(node);
				if (/^(-|\*|\/|%)$/.test(op)) out = { type: "number" };
				else if (/^(==|===|!=|!==|<|>|<=|>=)$/.test(op)) out = { type: "boolean" };
				else if (op === "+") {
					var left = info(node.getLeft()), right = info(node.getRight());
					out = { type: left.type === "string" || right.type === "string" ? "string" : left.type === "number" && right.type === "number" ? "number" : "any" };
				}
			}
			out.current = readsCurrent(node);
			return out;
		}
		// How well one value lands on one property: 0 when it cannot, 1 when its type is the property's
		function landing(prop, value) {
			if (!prop) return 0;
			if (prop.kind === "path") {
				// a destination takes a scope path, never a value
				return value.literal && typeof value.value === "string" && /^(input|local|result|session)(\.|\[|$)/.test(value.value) ? 1 : 0;
			}
			if (prop.current ? !value.current : value.current) return 0;
			if ((prop.kind === "literal" || prop.kind === "text") && !value.literal) return 0;
			var expected = jsonType(prop.type), allowed = prop["enum"] || [];
			if (value.literal && value.value !== null && allowed.length) {
				return allowed.map(String).indexOf(String(value.value)) >= 0 ? 1 : 0;
			}
			if (value.type !== "any" && expected !== "any" && value.type !== expected) return 0;
			if (allowed.length && !value.literal) return 0.6;
			return value.type === "any" && expected !== "any" ? 0.9 : 1;
		}
		// Positional arguments on the visible properties: one assignment that fits, or the order of the contract
		function positional(props, keys, values) {
			if (!values.length) return { keys: [], fit: 1, how: "none" };
			if (values.length > keys.length || values.length > 6 || keys.length > 14) return null;
			var weights = values.map(function (value) { return keys.map(function (key) { return landing(props[key], value); }); });
			var solutions = [];
			function search(index, chosen, score) {
				if (solutions.length >= 200) return;
				if (index === values.length) { solutions.push({ keys: chosen.slice(), score: score, order: solutions.length }); return; }
				keys.forEach(function (key, k) {
					if (weights[index][k] > 0 && chosen.indexOf(key) < 0) {
						chosen.push(key); search(index + 1, chosen, score * weights[index][k]); chosen.pop();
					}
				});
			}
			search(0, [], 1);
			if (!solutions.length) return null;
			if (solutions.length === 1) return { keys: solutions[0].keys, fit: 0.95, how: "types" };
			solutions.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
			if (solutions[0].score - solutions[1].score >= 0.2) return { keys: solutions[0].keys, fit: 0.9, how: "kinds" };
			var ordered = keys.slice(0, values.length);
			var fits = ordered.every(function (key, index) { return landing(props[key], values[index]) > 0; });
			return { keys: fits ? ordered : solutions[0].keys, fit: fits ? AMBIGUOUS : 0.7, how: "order" };
		}
		// One named key on the properties of a block
		function namedKey(key, props, keys, value) {
			if (props[key]) return { key: key, weight: props[key].hidden ? 0.9 : 1, how: props[key].hidden ? "deprecated" : "exact" };
			var lower = key.toLowerCase();
			var same = keys.filter(function (name) { return name.toLowerCase() === lower; });
			if (same.length === 1) return { key: same[0], weight: 0.95, how: "case" };
			var synonyms = (KEY_SYNONYMS[lower] || []).filter(function (name) { return keys.indexOf(name) >= 0; });
			if (synonyms.length) {
				var chosen = synonyms[0], weight = synonyms.length === 1 ? 0.92 : 0.8;
				if (synonyms.indexOf("text") >= 0 && synonyms.indexOf("html") >= 0 && value.literal && typeof value.value === "string") {
					// a body holding markup is the HTML body, any other literal the text body
					chosen = /<[a-z][^>]*>/i.test(value.value) ? "html" : "text";
					weight = 0.92;
				}
				return { key: chosen, weight: weight, how: "synonym", others: synonyms.filter(function (name) { return name !== chosen; }) };
			}
			var near = keys.map(function (name) { return { key: name, d: nearSpelling(key, name) }; })
				.filter(function (entry) { return entry.d > 0; }).sort(function (a, b) { return a.d - b.d; });
			if (near.length && (near.length === 1 || near[1].d > near[0].d)) return { key: near[0].key, weight: near[0].d === 1 ? 0.9 : 0.82, how: "spelling" };
			var scored = env.propertyCandidates ? env.propertyCandidates(props, key, 2) || [] : [];
			scored = scored.filter(function (candidate) { return keys.indexOf(candidate.property) >= 0; });
			if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) return { key: scored[0].property, weight: 0.7, how: "description" };
			return null;
		}
		// The allowed values a guessed name gives: crypto.md5 sets algorithm: "md5" on crypto.hash
		function valuesFromName(wanted, name, keys, props) {
			var fixed = [], own = tokens(String(name).substring(String(name).lastIndexOf(".") + 1));
			tokens(String(wanted).substring(String(wanted).lastIndexOf(".") + 1)).forEach(function (token) {
				if (own.indexOf(token) >= 0) return;
				var owners = keys.filter(function (key) {
					return (props[key]["enum"] || []).some(function (value) { return String(value).toLowerCase() === token; });
				});
				if (owners.length === 1 && !fixed.some(function (entry) { return entry[0] === owners[0]; })) {
					var allowed = props[owners[0]]["enum"].filter(function (value) { return String(value).toLowerCase() === token; })[0];
					fixed.push([owners[0], JSON.stringify(allowed)]);
				}
			});
			return fixed;
		}
		// The call of a block with its arguments mapped onto the contract: { text, fit, notes } or null
		function mapCall(name, call, args, wanted) {
			var props = catalog(name).props || {}, keys = visibleKeys(name), notes = [];
			if (catalog(name).dynamicProperties) return null;
			var fixed = wanted && wanted !== name ? valuesFromName(wanted, name, keys, props) : [];
			if (fixed.length) notes.push(fixed.map(function (entry) { return entry[0] + ": " + entry[1]; }).join(", ") + " from the name " + wanted);
			var fixedKeys = fixed.map(function (entry) { return entry[0]; });
			if (args.length === 1 && kind(args[0]) === "ObjectLiteral") {
				var object = args[0], objectText = textOf(object), offset = start(object), renames = [], fit = 1, targets = Object.create(null);
				var elements = list(object.getElements());
				for (var e = 0; e < elements.length; e++) {
					var element = elements[e], keyNode = element.getKey ? element.getKey() : element.getLeft();
					var key = kind(keyNode) === "Name" ? String(keyNode.getIdentifier()) : kind(keyNode) === "StringLiteral" ? String(keyNode.getValue()) : "";
					if (!key) return null;
					if (/^\$\$/.test(key)) continue;
					var valueNode = element.getValue ? element.getValue() : element.getRight();
					var value = info(valueNode), mapped = namedKey(key, props, keys.filter(function (k) { return fixedKeys.indexOf(k) < 0; }), value);
					if (!mapped) { notes.push(key + " has no property in " + name); fit = Math.min(fit, 0.3); continue; }
					if (targets[mapped.key]) { notes.push(key + " and " + targets[mapped.key] + " both map to " + mapped.key); fit = Math.min(fit, 0.4); }
					targets[mapped.key] = key;
					if (mapped.key !== key) {
						renames.push({ node: keyNode, element: element, valueNode: valueNode, key: mapped.key });
						notes.push(key + " -> " + mapped.key + " (" + mapped.how + (mapped.others && mapped.others.length ? ", or " + mapped.others.join(", ") : "") + ")");
					}
					if (mapped.how !== "exact" || fixed.length) {
						var lands = landing(props[mapped.key], value);
						if (!lands && !(props[mapped.key].kind === "path")) { notes.push(mapped.key + " expects " + (props[mapped.key].type || "another value") + (props[mapped.key]["enum"] ? " in " + props[mapped.key]["enum"].join("/") : "")); fit = Math.min(fit, 0.5); }
					}
					fit = Math.min(fit, mapped.weight);
				}
				renames.sort(function (a, b) { return start(b.node) - start(a.node); }).forEach(function (rename) {
					var shorthand = rename.valueNode === rename.node || start(rename.valueNode) === start(rename.node);
					var replacement = shorthand ? identifierKey(rename.key) + ": " + text(rename.node) : identifierKey(rename.key);
					objectText = objectText.substring(0, start(rename.node) - offset) + replacement + objectText.substring(end(rename.node) - offset);
				});
				if (fixed.length) {
					var close = objectText.lastIndexOf("}"), before = objectText.substring(0, close).replace(/\s+$/, "");
					var added = fixed.map(function (entry) { return identifierKey(entry[0]) + ": " + entry[1]; }).join(", ");
					objectText = before + (/[{,]$/.test(before) ? " " : ", ") + added + " " + objectText.substring(close);
				}
				if (!renames.length && !fixed.length && name === wanted) return null;
				var exactKeys = Object.keys(targets).length;
				return { text: name + "(" + objectText + ")", fit: fit, notes: notes, confirmed: !renames.length && fit === 1 && exactKeys >= 2 };
			}
			var values = args.map(info);
			var free = keys.filter(function (key) { return fixedKeys.indexOf(key) < 0; });
			var mapping = positional(props, free, values);
			if (!mapping) return { text: "", fit: 0, notes: notes.concat(["the arguments fit no assignment of " + name + "({ " + keys.join(", ") + " })"]) };
			var pairs = mapping.keys.map(function (key, index) { return [key, textOf(args[index])]; }).concat(fixed);
			if (mapping.how === "order") notes.push("positional order taken from the contract: " + mapping.keys.join(", ") + " (several assignments fit)");
			else if (mapping.how !== "none") notes.push("positional arguments as " + mapping.keys.join(", ") + " by their types");
			return { text: blockCall(name, pairs), fit: mapping.fit, notes: notes };
		}
		function blockCall(name, pairs) {
			return name + "({" + (pairs.length ? " " + pairs.map(function (pair) { return identifierKey(pair[0]) + ": " + pair[1]; }).join(", ") + " " : "") + "})";
		}
		// correctSource names positional arguments by themselves when their JSON types give one assignment
		function namedByCorrections(name, args) {
			var props = catalog(name).props || {}, keys = visibleKeys(name), solutions = 0;
			if (!args.length || args.length > keys.length || args.length > 6 || keys.length > 12 || catalog(name).dynamicProperties) return !args.length;
			var types = args.map(function (arg) { var value = info(arg); return value.type; });
			(function search(index, chosen) {
				if (solutions > 1) return;
				if (index === types.length) { solutions++; return; }
				keys.forEach(function (key) {
					var expected = jsonType(props[key].type);
					if (chosen.indexOf(key) < 0 && (types[index] === "any" || expected === "any" || types[index] === expected)) {
						chosen.push(key); search(index + 1, chosen); chosen.pop();
					}
				});
			})(0, []);
			return solutions === 1;
		}

		// A block written inside a condition is not lifted by the safe corrections (it would run unconditionally):
		// its edit is proposed with what to do, never applied
		function lazyContext(call) {
			for (var parent = call.getParent(); parent; parent = parent.getParent()) {
				var k = kind(parent);
				if (k === "ConditionalExpression" || k === "InfixExpression" && /^(&&|\|\||\?\?)$/.test(operator(parent))) {
					return "It is inside a condition: assign it to a local in the branch that needs it.";
				}
				if (k === "ExpressionStatement" || k === "ReturnStatement" || k === "VariableInitializer" || k === "FunctionNode") return "";
				if (/^(IfStatement|WhileLoop|DoLoop|ForLoop|ForInLoop|SwitchStatement)$/.test(k)) {
					return "It is in the condition of a statement: assign it to a local before it.";
				}
			}
			return "";
		}

		// Calls innermost first: a resolved inner call is part of the text of the call around it
		var header = [];
		var calls = [];
		ast.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (node) {
			var k = kind(node);
			if (k === "VariableInitializer" && kind(node.getTarget()) === "Name" && /^(_flow|_meta)$/.test(String(node.getTarget().getIdentifier()))) {
				header.push([start(node), end(node)]);
				return false;
			}
			if (k === "FunctionCall") calls.push(node);
			return true;
		} }));
		calls.sort(function (a, b) { return (end(a) - start(a)) - (end(b) - start(b)) || start(a) - start(b); });
		var resolved = [], unresolved = [];
		function textOf(node) {
			var value = text(node), offset = start(node);
			resolved.filter(function (entry) { return !entry.merged && entry.start >= offset && entry.end <= end(node); })
				.sort(function (a, b) { return b.start - a.start; }).forEach(function (entry) {
					value = value.substring(0, entry.start - offset) + entry.text + value.substring(entry.end - offset);
				});
			return value;
		}
		var R = {
			kind: kind,
			info: info,
			text: textOf,
			blockExists: function (name) { return !!blocks[name]; },
			blockCall: blockCall,
			needsParentheses: function () { return false; }
		};
		calls.forEach(function (call) {
			var name = dottedName(call.getTarget());
			if (!name || name === "i_" || header.some(function (range) { return start(call) >= range[0] && end(call) <= range[1]; })) return;
			if (SCOPES.test(name.split(".")[0]) || has(EXPRESSION_FUNCTIONS, name)) return;
			var args = list(call.getArguments()), result = null;
			if (has(rewrites, name)) {
				R.needsParentheses = function () { return /^(InfixExpression|UnaryExpression|PropertyGet|ElementGet)$/.test(kind(call.getParent())); };
				result = rewrites[name](R, args, call);
				if (result.unresolved) { unresolved.push({ line: line(start(call)), call: text(call), reason: name + ": " + result.unresolved }); return; }
			} else if (blocks[name]) {
				// positional arguments of one assignment by their types: correctSource names them itself
				// Every positional mapping is proposed, including a unique mapping.
				var mapped = mapCall(name, call, args, name);
				if (!mapped) return;
				if (!mapped.text) { unresolved.push({ line: line(start(call)), call: text(call), reason: mapped.notes.join("; ") }); return; }
				result = { text: mapped.text, confidence: mapped.fit, block: name, reason: name + ": " + mapped.notes.join("; ") + "." };
			} else {
				var expression = expressionAlias(name);
				if (expression) {
					var single = args.length === 1 && kind(args[0]) === "ObjectLiteral" ? list(args[0].getElements()) : null;
					if (single && single.length !== 1) { unresolved.push({ line: line(start(call)), call: text(call), reason: name + " is the expression " + expression + "(value): give it the value alone." }); return; }
					var operands = single ? [textOf(single[0].getValue ? single[0].getValue() : single[0].getRight())] : args.map(textOf);
					result = { text: expression + "(" + operands.join(", ") + ")", confidence: 0.9, block: "",
						reason: name + " is not a block: the expression function " + expression + "(...) does it." };
				} else {
					var wantedNamespace = name.lastIndexOf(".") > 0 ? name.substring(0, name.lastIndexOf(".")) : "";
					var ranked = scorer.rank(name, { names: Object.keys(blocks).filter(function (blockName) { return !!descriptor(blockName); }), descriptor: descriptor }) || [];
					var options = ranked.slice(0, 3).map(function (candidate) {
						if (!blocks[candidate.block] || candidate.confidence < 0.5) return null;
						var mapping = mapCall(candidate.block, call, args, name);
						if (!mapping && args.length === 1 && kind(args[0]) === "ObjectLiteral") mapping = { text: candidate.block + "(" + textOf(args[0]) + ")", fit: 0.8, notes: ["its properties are dynamic"] };
						if (!mapping || !mapping.text) return null;
						var nameConfidence = candidate.confidence;
						// named keys that are all properties of the block confirm the name
						if (mapping.confirmed) nameConfidence = Math.min(1, nameConfidence + 0.1);
						// another domain (invoice.send for email.send) is proposed, never applied
						var namespace = candidate.block.lastIndexOf(".") > 0 ? candidate.block.substring(0, candidate.block.lastIndexOf(".")) : "";
						var domain = !!wantedNamespace && relatedNamespace(wantedNamespace, namespace);
						if (!domain) nameConfidence = Math.min(nameConfidence, AMBIGUOUS);
						return { block: candidate.block, name: round2(nameConfidence), mapping: mapping, domain: domain,
							confidence: round2(nameConfidence * mapping.fit) };
					}).filter(function (option) { return option; }).sort(function (a, b) { return b.confidence - a.confidence; });
					if (!options.length || options[0].confidence < 0.3) {
						unresolved.push({ line: line(start(call)), call: text(call), reason: name + " is not a block, and no block of the catalog matches it" +
							(ranked.length ? " clearly (closest: " + ranked.slice(0, 3).map(function (candidate) { return candidate.block; }).join(", ") + ")" : "") +
							"; if it is a domain operation of the project, create it with flow-block-mock." });
						return;
					}
					var best = options[0], confidence = best.confidence, others = "";
					if (options[1] && options[1].confidence >= best.confidence - 0.1) {
						confidence = Math.min(confidence, AMBIGUOUS);
						others = "; " + options[1].block + " is about as likely";
					}
					result = { text: best.mapping.text, confidence: confidence, block: best.block,
						reason: name + " is not a block: " + best.block + " (name " + best.name + (best.domain ? "" : ", another namespace") + ")" +
							(best.mapping.notes.length ? "; " + best.mapping.notes.join("; ") : "") + others + "." };
				}
			}
			// Invariant: the call written keeps every prefix operator of the call read; a loss is refused, never proposed
			if (env.prefixOperatorCount(call) !== env.prefixOperatorCount(result.text)) {
				unresolved.push({ line: line(start(call)), call: text(call), reason: name + ": the rewrite would not keep every prefix operator (!, -, typeof...) of its arguments; write it with named properties." });
				return;
			}
			var lazy = result.block ? lazyContext(call) : "";
			if (lazy) {
				result.confidence = Math.min(result.confidence, AMBIGUOUS);
				result.reason += " " + lazy;
			}
			// a resolved call inside this one is part of this edit
			var inner = resolved.filter(function (entry) { return !entry.merged && entry.start >= start(call) && entry.end <= end(call); });
			inner.forEach(function (entry) {
				entry.merged = true;
				result.confidence = Math.min(result.confidence, entry.confidence);
				result.reason += " " + entry.reason;
			});
			resolved.push({ node: call, start: start(call), end: end(call), text: result.text, confidence: round2(result.confidence),
				reason: result.reason, block: result.block || "", line: line(start(call)) });
		});
		var edits = editsFor(source, resolved.filter(function (entry) { return !entry.merged; }));
		unresolved.sort(function (a, b) { return a.line - b.line; });
		return { threshold: threshold, scorer: scorer.name || "custom", edits: edits, unresolved: unresolved };
	}

	// The resolutions as edits applied in order, each oldText found once in the text the edits before it left
	function editsFor(source, resolutions) {
		var spans = resolutions.slice().sort(function (a, b) { return a.start - b.start; }).map(function (entry) {
			return { start: entry.start, end: entry.end, parts: [entry], line: entry.line };
		});
		function newText(span) {
			var value = "", at = span.start;
			span.parts.forEach(function (part) {
				value += source.substring(at, part.start) + part.text;
				at = part.end;
			});
			return value + source.substring(at, span.end);
		}
		function lineStart(offset) { var at = source.lastIndexOf("\n", offset - 1); return at < 0 ? 0 : at + 1; }
		function lineEnd(offset) { var at = source.indexOf("\n", offset); return at < 0 ? source.length : at; }
		function count(text, part) {
			var found = 0, at = text.indexOf(part);
			while (at >= 0 && found < 2) { found++; at = text.indexOf(part, at + 1); }
			return found;
		}
		function widen(span) {
			if (span.start > lineStart(span.start) || span.end < lineEnd(span.end)) {
				span.start = lineStart(span.start); span.end = lineEnd(span.end);
			} else if (span.start > 0) {
				span.start = lineStart(span.start - 1);
			} else {
				span.end = lineEnd(Math.min(source.length, span.end + 1));
			}
		}
		function mergeOverlaps() {
			for (var i = 1; i < spans.length; i++) {
				if (spans[i].start < spans[i - 1].end) {
					spans[i - 1].end = Math.max(spans[i - 1].end, spans[i].end);
					spans[i - 1].parts = spans[i - 1].parts.concat(spans[i].parts);
					spans.splice(i, 1);
					i--;
				}
			}
		}
		for (var round = 0; round < 64; round++) {
			var changed = false, text = source;
			for (var i = 0; i < spans.length; i++) {
				var old = source.substring(spans[i].start, spans[i].end);
				if (count(text, old) !== 1 && !(spans[i].start === 0 && spans[i].end === source.length)) {
					widen(spans[i]);
					changed = true;
					break;
				}
				var at = text.indexOf(old);
				text = text.substring(0, at) + newText(spans[i]) + text.substring(at + old.length);
			}
			if (!changed) break;
			mergeOverlaps();
		}
		return spans.map(function (span) {
			var confidence = Math.min.apply(null, span.parts.map(function (part) { return part.confidence; }));
			var blocks = span.parts.map(function (part) { return part.block; }).filter(function (name, index, all) { return name && all.indexOf(name) === index; });
			return {
				oldText: source.substring(span.start, span.end),
				newText: newText(span),
				line: span.line,
				confidence: confidence,
				reason: span.parts.map(function (part) { return part.reason; }).join(" "),
				block: blocks.join(", ")
			};
		});
	}

	// The edits applied in order as code-patch applies them; an edit whose oldText is no longer found once is skipped
	function applyEdits(source, edits) {
		var code = String(source || ""), applied = [], skipped = [];
		(edits || []).forEach(function (edit) {
			var at = code.indexOf(edit.oldText);
			if (at < 0 || code.indexOf(edit.oldText, at + 1) >= 0) { skipped.push(edit); return; }
			code = code.substring(0, at) + edit.newText + code.substring(at + edit.oldText.length);
			applied.push(edit);
		});
		return { code: code, applied: applied, skipped: skipped };
	}

	function normalizedThreshold(value) {
		var number = Number(value);
		if (value === undefined || value === null || value === "" || !isFinite(number)) return DEFAULT_THRESHOLD;
		return Math.max(LOWEST_THRESHOLD, Math.min(1, number));
	}

	// The source read as JavaScript, `if({` masked as the call it is in FlowScript (offsets unchanged); null when it is
	// not JavaScript, and then nothing is proposed
	function parse(source) {
		var masked = source.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|\bif\s*(?=\(\s*\{)/g,
			function (token) { return /^if\b/.test(token) ? "i_" + token.substring(2) : token; });
		try {
			var options = new Packages.org.mozilla.javascript.CompilerEnvirons();
			options.setLanguageVersion(200);
			options.setRecordingComments(true);
			options.setErrorReporter(new Packages.org.mozilla.javascript.ErrorReporter({
				warning: function () {}, error: function (message) { throw new Error(String(message)); },
				runtimeError: function (message) { return new Packages.org.mozilla.javascript.EvaluatorException(String(message)); }
			}));
			return new Packages.org.mozilla.javascript.Parser(options).parse(masked, "flow-intuitive-calls", 1);
		} catch (_notJavaScript) {
			return null;
		}
	}

	return {
		DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
		resolve: resolve,
		applyEdits: applyEdits,
		textScorer: textScorer,
		normalizedThreshold: normalizedThreshold
	};
})();
