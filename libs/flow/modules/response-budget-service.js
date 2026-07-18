(function () {
	var CURSOR_PREFIX = "rb1.";

	function numberOption(value, fallback, min, max) {
		var number = Number(value);
		if (!isFinite(number)) {
			number = fallback;
		}
		number = Math.floor(number);
		if (min !== undefined && number < min) {
			number = min;
		}
		if (max !== undefined && number > max) {
			number = max;
		}
		return number;
	}

	function decodeCursor(cursor, key, env) {
		var text = String(cursor || "").trim();
		if (!text || text.indexOf(CURSOR_PREFIX) !== 0) {
			return null;
		}
		try {
			var json = env.base64UrlDecode(text.substring(CURSOR_PREFIX.length));
			var payload = JSON.parse(json);
			if (!payload || payload.v !== 1 || String(payload.key || "") !== String(key || "")) {
				env.raise("RESPONSE_CURSOR_MISMATCH", "This response cursor belongs to another query.", null,
					"Restart without cursor after changing project, query, filters or sort order.");
			}
			return payload.state || {};
		} catch (e) {
			if (e && String(e.code || "") === "RESPONSE_CURSOR_MISMATCH") {
				throw e;
			}
			env.raise("INVALID_RESPONSE_CURSOR", "Invalid response cursor.", null,
				"Use nextCursor exactly as returned by the previous tool response.");
		}
		return null;
	}

	function create(request, options, env) {
		request = request || {};
		options = options || {};
		var startedAt = env.nowMillis();
		var timeoutMs = numberOption(request.timeoutMs, 0, 0, 300000);
		var answerBefore = numberOption(request.answerBefore, 0, 0);
		if (!answerBefore && timeoutMs) {
			answerBefore = startedAt + timeoutMs;
		}
		var maxResponseKB = numberOption(request.maxResponseKB !== undefined ? request.maxResponseKB : request.maxKB,
			0, 0, 10240);
		var minItems = numberOption(request.minItems, options.minItems === undefined ? 1 : options.minItems, 0, 1000);
		var key = String(options.key || "");
		var stoppedReason = "";
		var stoppedState = null;
		var estimatedBytes = 0;
		var itemCount = 0;
		var enabled = answerBefore > 0 || maxResponseKB > 0;

		function encodeCursor(state) {
			return CURSOR_PREFIX + env.base64UrlEncode(JSON.stringify({ v: 1, key: key, state: state || {} }));
		}

		function cursor(defaultState) {
			return decodeCursor(request.cursor, key, env) || defaultState || {};
		}

		function shouldContinue(count, resumeState, workCount) {
			if (!enabled || (Number(count || 0) < minItems &&
					(workCount === undefined || Number(workCount || 0) < minItems))) {
				return true;
			}
			if (answerBefore > 0 && env.nowMillis() >= answerBefore) {
				stoppedReason = "time";
				stoppedState = resumeState || {};
				return false;
			}
			return true;
		}

		function tryAdd(items, item, resumeState) {
			var itemBytes = env.utf8Length(JSON.stringify(item));
			if (maxResponseKB > 0 && itemCount >= minItems && estimatedBytes + itemBytes > maxResponseKB * 1024) {
				stoppedReason = "size";
				stoppedState = resumeState || {};
				return false;
			}
			items.push(item);
			estimatedBytes += itemBytes;
			itemCount += 1;
			return true;
		}

		function finish(out, hasMore, nextState) {
			var partial = stoppedReason !== "";
			out.partial = partial;
			if (partial) {
				out.nextCursor = encodeCursor(stoppedState || nextState || {});
				out.warnings = (out.warnings || []).concat([{
					code: stoppedReason === "time" ? "PARTIAL_RESULT_TIME_BUDGET" : "PARTIAL_RESULT_SIZE_BUDGET",
					message: stoppedReason === "time"
						? "Response generation stopped before answerBefore. Continue with nextCursor."
						: "Response generation stopped at maxResponseKB. Continue with nextCursor."
				}]);
			} else if (hasMore && nextState) {
				out.nextCursor = encodeCursor(nextState);
			}
			if (enabled && (partial || request.includeResponseBudget === true)) {
				out.responseBudget = {
					elapsedMs: Math.max(0, env.nowMillis() - startedAt),
					estimatedKB: Math.round(estimatedBytes / 10.24) / 100,
					itemCount: itemCount,
					answerBefore: answerBefore || null,
					maxResponseKB: maxResponseKB || null,
					minItems: minItems,
					stopReason: stoppedReason || null
				};
			}
			return out;
		}

		return {
			enabled: enabled,
			cursor: cursor,
			shouldContinue: shouldContinue,
			tryAdd: tryAdd,
			finish: finish
		};
	}

	return {
		create: create
	};
}())
