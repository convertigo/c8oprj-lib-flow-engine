(function () {
	// Only the HTTP requester's own uncaught Flow failure sets its response status.
	// A nested Flow, an MCP tool error or ordinary business data never owns that status.
	// thrown: the error that ended the run. An author's throw (marked by the throw block) without status sets
	// none: the requester answers 200 with the error envelope. Internal failures answer 500, an explicit
	// status from 400 to 599 is kept.
	function apply(request, result, invocation, thrown) {
		if (!result || result.ok !== false || !result.error || !owns(request, invocation)) return;
		try {
			var status = result.error.status;
			if (applicationError(thrown) && (status === undefined || status === null || status === "")) return;
			status = Number(status);
			if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
			invocation.setResponseStatus(status, "");
		} catch (_unavailableHttpContext) {
			// Preserve the original Flow diagnostic when a requester has no HTTP response API.
		}
	}
	// The run that owns the HTTP response: the Flow the requester was asked for, in its own requester context. A nested
	// Flow (request.__parentRun), an MCP tool, a schedule or another requestable sharing the HTTP request does not.
	// Also the guard of response.status and response.header (ctx.httpResponse).
	function owns(request, invocation) {
		if (!request || request.__parentRun || !request.flowQName || !invocation) return false;
		try {
			var http = invocation.httpServletRequest;
			var root = http && http.getAttribute("convertigo.requester");
			if (!root || !root.context) return false;
			var same = root.context === invocation || typeof root.context.equals === "function" && root.context.equals(invocation);
			return !!same && !!invocation.requestedObject && String(invocation.requestedObject.getQName()) === String(request.flowQName);
		} catch (_unavailableHttpContext) {
			return false;
		}
	}
	function applicationError(thrown) {
		return !!thrown && typeof thrown === "object" && thrown.__flowApplicationError === true;
	}
	return {apply: apply, owns: owns};
}())
