(function () {
	function number(value, fallback) {
		value = Number(value);
		return isFinite(value) && value >= 0 ? value : Number(fallback || 0);
	}

	function timestamp(value) {
		var parsed = new Date(String(value || "")).getTime();
		return isFinite(parsed) ? parsed : 0;
	}

	function summarize(viewerState, now, staleMs) {
		now = number(now, new Date().getTime());
		staleMs = number(staleMs, 90000);
		var viewers = viewerState && viewerState.viewers || [];
		var active = [];
		var lastViewerAt = 0;
		for (var i = 0; i < viewers.length; i++) {
			var viewer = viewers[i] || {};
			var lastSeen = number(viewer.lastSeen, 0);
			if (!lastSeen || now - lastSeen > staleMs) {
				continue;
			}
			active.push(String(viewer.id || ""));
			lastViewerAt = Math.max(lastViewerAt, lastSeen);
		}
		return {
			viewerCount: active.length,
			viewerIds: active,
			lastViewerAt: lastViewerAt
		};
	}

	function update(entry, viewerState, now) {
		entry = entry || {};
		now = number(now, new Date().getTime());
		var policy = entry.idlePolicy || {};
		var summary = summarize(viewerState, now, policy.viewerStaleMs);
		var previousCount = number(entry.viewerCount, 0);
		var previousIds = (entry.viewerIds || []).join("\n");
		var transitionChanged = previousCount !== summary.viewerCount
			|| previousIds !== summary.viewerIds.join("\n");
		var changed = transitionChanged;
		entry.viewerCount = summary.viewerCount;
		entry.viewerIds = summary.viewerIds;

		if (summary.viewerCount > 0) {
			if (!entry.firstViewerAt) {
				entry.firstViewerAt = new Date(now).toISOString();
				transitionChanged = true;
				changed = true;
			}
			if (summary.lastViewerAt > timestamp(entry.lastViewerAt)) {
				entry.lastViewerAt = new Date(summary.lastViewerAt).toISOString();
				changed = true;
			}
			if (entry.lastViewerGoneAt) {
				entry.lastViewerGoneAt = "";
				transitionChanged = true;
				changed = true;
			}
		} else if (previousCount > 0) {
			entry.lastViewerGoneAt = new Date(now).toISOString();
			transitionChanged = true;
			changed = true;
		}

		if (transitionChanged) {
			entry.lastViewerTransitionAt = new Date(now).toISOString();
		}

		var stopReason = "";
		var startedAt = timestamp(entry.startedAt) || now;
		if (!entry.firstViewerAt) {
			if (now - startedAt >= number(policy.firstViewerTimeoutMs, 15 * 60 * 1000)) {
				stopReason = "first-viewer-timeout";
			}
		} else if (summary.viewerCount === 0) {
			var emptySince = timestamp(entry.lastViewerGoneAt)
				|| timestamp(entry.lastViewerAt)
				|| timestamp(entry.firstViewerAt);
			if (emptySince && now - emptySince >= number(policy.noViewerTimeoutMs, 2 * 60 * 1000)) {
				stopReason = "no-viewer-timeout";
			}
		}

		return {
			changed: changed,
			stopReason: stopReason,
			viewerCount: summary.viewerCount,
			viewerIds: summary.viewerIds
		};
	}

	return {
		summarize: summarize,
		update: update
	};
}())
