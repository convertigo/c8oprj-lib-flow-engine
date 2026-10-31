(function () {
	// Only the HTTP requester's own uncaught Flow failure sets its response status.
	// A nested Flow, an MCP tool error or ordinary business data never owns that status.
	function apply(request, result, invocation) {
		if (!result || result.ok !== false || !result.error || !request || request.__parentRun || !request.flowQName || !invocation) return;
		try {
			var http = invocation.httpServletRequest;
			var root = http && http.getAttribute("convertigo.requester");
			if (!root || !root.context) return;
			var same = root.context === invocation || typeof root.context.equals === "function" && root.context.equals(invocation);
			if (!same || !invocation.requestedObject || String(invocation.requestedObject.getQName()) !== String(request.flowQName)) return;
			var status = Number(result.error.status);
			if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
			invocation.setResponseStatus(status, "");
		} catch (_unavailableHttpContext) {
			// Preserve the original Flow diagnostic when a requester has no HTTP response API.
		}
	}
	return {apply: apply};
}())
