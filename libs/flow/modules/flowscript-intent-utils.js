(function () {
	function stripMetadata(value) {
		if (value instanceof Array) {
			return value.map(stripMetadata);
		}
		if (value && typeof value === "object") {
			var out = {};
			Object.keys(value).forEach(function (key) {
				if (key.indexOf("__flowScript") !== 0) {
					out[key] = stripMetadata(value[key]);
				}
			});
			return out;
		}
		return value;
	}

	function intentTokens(value) {
		return String(value || "")
			.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(function (token) {
				return token.length > 1;
			});
	}

	function expandIntentTokens(tokens, env) {
		var aliases = {
			add: ["append", "push", "insert"],
			append: ["add", "push"],
			array: ["list", "items"],
			call: ["requestable", "sequence", "transaction", "invoke"],
			email: ["mail", "notify", "notification", "send"],
			fetch: ["get", "http", "request"],
			field: ["by", "path", "key"],
			find: ["search", "select", "query"],
			get: ["fetch", "read"],
			hash: ["sha", "sha256", "digest"],
			http: ["url", "request", "fetch"],
			json: ["object", "parse", "stringify"],
			key: ["by", "field"],
			mail: ["email", "notify", "send"],
			map: ["transform", "select"],
			notify: ["email", "mail", "send"],
			order: ["sort"],
			parse: ["json", "read"],
			pick: ["select", "path"],
			query: ["search", "select"],
			read: ["get", "load"],
			request: ["http", "call", "requestable"],
			requestable: ["call", "sequence", "transaction"],
			search: ["find", "query"],
			select: ["pick", "path", "map"],
			sequence: ["requestable", "call"],
			send: ["email", "mail", "notify"],
			sort: ["order"],
			transaction: ["requestable", "call"],
			uri: ["url", "endpoint"],
			url: ["http", "request"],
			write: ["set", "save"]
		};
		var out = [];
		(tokens || []).forEach(function (token) {
			env.addUnique(out, token);
			(aliases[token] || []).forEach(function (alias) {
				env.addUnique(out, alias);
			});
		});
		return out;
	}

	function intentScoreText(text, tokens) {
		text = String(text || "").toLowerCase();
		var score = 0;
		(tokens || []).forEach(function (token) {
			if (!token) {
				return;
			}
			if (text === token) {
				score += 18;
			} else if (text.indexOf(token) !== -1) {
				score += 6;
			}
		});
		return score;
	}

	function blockCandidateScore(descriptor, wanted, env) {
		var wantedText = String(wanted || "").toLowerCase();
		var wantedTokens = expandIntentTokens(intentTokens(wanted), env);
		var wantedParts = wantedText.split(".");
		var wantedLocalName = wantedParts.length > 1 ? wantedParts[wantedParts.length - 1] : wantedText;
		var wantedNamespace = wantedParts.length > 1 ? wantedParts.slice(0, wantedParts.length - 1).join(".") : "";
		var blockId = String(descriptor.blockId || descriptor.name || "").toLowerCase();
		var localName = String(descriptor.localName || descriptor.name || "").toLowerCase();
		var namespace = String(descriptor.namespace || "").toLowerCase();
		var tags = (descriptor.tags || []).join(" ").toLowerCase();
		var props = Object.keys(descriptor.props || {}).join(" ").toLowerCase();
		var desc = String(descriptor.description || "").toLowerCase();
		var score = 0;
		if (blockId === wantedText || localName === wantedText) {
			score += 120;
		} else if (blockId.replace(/\./g, "") === wantedText.replace(/\./g, "")) {
			score += 85;
		} else if (blockId.indexOf(wantedText) !== -1 ||
				(blockId.length >= 4 && wantedText.indexOf(blockId) !== -1)) {
			score += 45;
		}
		if (wantedNamespace) {
			if (namespace === wantedNamespace) {
				score += 70;
			} else if (namespace.indexOf(wantedNamespace + ".") === 0 || wantedNamespace.indexOf(namespace + ".") === 0) {
				score += 35;
			}
			if (localName === wantedLocalName) {
				score += 55;
			}
		}
		score += intentScoreText(localName, wantedTokens) * 2;
		score += intentScoreText(blockId, wantedTokens);
		score += intentScoreText(namespace, wantedTokens);
		score += intentScoreText(tags, wantedTokens);
		score += Math.floor(intentScoreText(props, wantedTokens) / 2);
		score += Math.floor(intentScoreText(desc, wantedTokens) / 3);
		if (wantedTokens.indexOf("fetch") !== -1 && (namespace === "http" || localName === "get" || localName === "request")) {
			score += 40;
		}
		if ((wantedTokens.indexOf("email") !== -1 || wantedTokens.indexOf("mail") !== -1 || wantedTokens.indexOf("notify") !== -1) &&
				(namespace === "email" || blockId.indexOf("email.") === 0)) {
			score += 40;
		}
		if ((wantedTokens.indexOf("sort") !== -1 || wantedTokens.indexOf("order") !== -1) && blockId === "list.sort") {
			score += 40;
		}
		return score;
	}

	function blockCandidates(blocks, wanted, limit, env) {
		limit = limit || 5;
		var candidates = Object.keys(blocks || {}).map(function (name) {
			var descriptor = env.blockDescriptor(blocks[name]);
			var score = blockCandidateScore(descriptor, wanted, env);
			return {
				block: descriptor.blockId,
				score: score,
				confidence: Math.min(1, Math.round((score / 80) * 100) / 100),
				signature: env.blockSignature(descriptor),
				description: descriptor.description || ""
			};
		}).filter(function (candidate) {
			return candidate.score > 0;
		}).sort(function (a, b) {
			return b.score - a.score || String(a.block).localeCompare(String(b.block));
		});
		if (!candidates.length) {
			return [];
		}
		var best = candidates[0].score;
		var strongThreshold = Math.max(35, Math.floor(best * 0.8));
		return candidates.filter(function (candidate, index) {
			return index === 0 || candidate.score >= strongThreshold;
		}).slice(0, limit);
	}

	function propertyCandidates(props, wanted, limit, env) {
		limit = limit || 5;
		var wantedTokens = expandIntentTokens(intentTokens(wanted), env);
		return Object.keys(props || {}).map(function (name) {
			var descriptor = props[name] || {};
			var text = [
				name,
				descriptor.kind || "",
				descriptor.type || "",
				descriptor.mode || "",
				descriptor.description || ""
			].join(" ").toLowerCase();
			var score = String(name).toLowerCase() === String(wanted || "").toLowerCase() ? 100 : intentScoreText(text, wantedTokens);
			return {
				property: name,
				score: score,
				signature: env.summaryPropertyDescriptor(descriptor),
				description: descriptor.description || ""
			};
		}).filter(function (candidate) {
			return candidate.score > 0;
		}).sort(function (a, b) {
			return b.score - a.score || String(a.property).localeCompare(String(b.property));
		}).slice(0, limit);
	}

	return {
		stripMetadata: stripMetadata,
		blockCandidates: blockCandidates,
		propertyCandidates: propertyCandidates
	};
})();
