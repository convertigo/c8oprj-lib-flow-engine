(function () {
	// Only the HTTP requester's own uncaught Flow failure sets its response status.
	// A nested Flow, an MCP tool error or ordinary business data never owns that status.
	// thrown: the error that ended the run. An author's throw (marked by the throw block) without status sets
	// none: the requester answers 200 with the error envelope. Internal failures answer 500, an explicit
	// status from 400 to 599 is kept.
	function apply(request, result, invocation, thrown) {
		if (!result || result.ok !== false || !result.error) return;
		if (!owns(request, invocation)) {
			answerCaller(request, result, invocation, thrown);
			return;
		}
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
	// A run asked through another requester (a requestable.call of a regular Flow, a legacy call, a schedule) answers its
	// caller, not the HTTP response: an internal failure says status 500 in its envelope, an application error keeps no
	// status or its own, so requestable.call raises it as it was (call.block.js applicationFailure).
	function answerCaller(request, result, invocation, thrown) {
		if (!request || request.__parentRun || !request.flowQName || !invocation || applicationError(thrown)) return;
		try {
			if (!invocation.requestedObject || String(invocation.requestedObject.getQName()) !== String(request.flowQName)) return;
		} catch (_noRequestedObject) {
			return;
		}
		var status = Number(result.error.status);
		if (!Number.isInteger(status) || status < 400 || status > 599) result.error.status = 500;
	}
	// An application error (an author's throw, a missing required input, ctx.throwFlow(error, node, {applicative: true}))
	// carries a hidden property of the thrown error: never copied to an envelope (Engine.js failure).
	function markApplication(error) {
		if (error && typeof error === "object" && Object.isExtensible(error) && error.__flowApplicationError !== true) {
			Object.defineProperty(error, "__flowApplicationError", {value: true});
		}
		return error;
	}
	function applicationError(thrown) {
		return !!thrown && typeof thrown === "object" && thrown.__flowApplicationError === true;
	}
	// response.status and response.header: a requestable run, or a run called by one (flow.call, requestable.call), sets
	// the response of its Convertigo context, whose HTTP request a called requestable shares up to the root request (a
	// SetResponseStatusStep of a called sequence does the same, InternalRequester keeping the HTTP request of its caller).
	// Without HTTP request (a schedule, a FullSync listener), the request is internal: nothing reaches a response. An
	// authoring or MCP tool run is not a requestable run of its context: it sets nothing.
	function requestableRun(request, invocation) {
		if (!invocation) return false;
		try {
			var qname = invocation.requestedObject ? String(invocation.requestedObject.getQName()) : "";
			for (var run = request, depth = 0; qname && run && depth < 64; run = run.__parentRun && run.__parentRun.request, depth++) {
				if (run.flowQName && String(run.flowQName) === qname) return true;
			}
		} catch (_noRequestedObject) {
			// no requestable run
		}
		return false;
	}
	return {apply: apply, owns: owns, requestableRun: requestableRun, markApplication: markApplication,
		applicationError: applicationError};
}())
