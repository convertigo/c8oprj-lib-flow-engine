const _meta = {
  "version": 1,
  "icon": "mdi:database-off-outline",
  "tags": [
    "cache",
    "control",
    "safety"
  ],
  "description": "Prevents the current response from being stored in Convertigo CacheManager.",
  "longDescription": "Use this explicit safety action before returning or throwing when an HTTP response, parsed payload, output contract or business result is not safe to cache. It only affects the current Flow or Sequence execution; a previously healthy cache entry is preserved.",
  "outputs": {
    "out": {
      "type": "boolean",
      "description": "Always false, matching the cache-enabled flag after this action."
    }
  },
  "runtime": "rhino"
}

(function () {
	return {
		run: function (ctx) {
			ctx.convertigoContext().isCacheEnabled = false;
			return false;
		}
	};
}())
