const _meta = {
  "version": 1,
  "icon": "mdi:shield-alert-outline",
  "tags": [
    "cache",
    "control",
    "safety",
    "error"
  ],
  "description": "Runs child nodes and prevents CacheManager storage if they throw.",
  "longDescription": "Wrap network and parsing work in this block. If any child throws, the current Flow or Sequence execution is marked unsafe for CacheManager storage before the original error is rethrown. Use cache.preventStore separately for invalid successful responses such as HTTP 403, 429 or 5xx and invalid business contracts.",
  "slots": [
    {
      "name": "nodes",
      "label": "Flow",
      "inline": true,
      "scope": "caller",
      "description": "Runs in the caller scope under cache-store protection."
    }
  ],
  "children": [
    "nodes"
  ],
  "runtime": "rhino"
}

(function () {
	return {
		run: function (ctx, node) {
			try {
				return ctx.runNodes(node.nodes || []);
			} catch (error) {
				ctx.convertigoContext().isCacheEnabled = false;
				throw error;
			}
		}
	};
}())
