(function () {
	function cleanPublicBase(value) {
		var text = String(value || "").trim().replace(/\/+$/, "");
		var match = /^(https?):\/\/([^\/?#]+)(\/[^?#]*)?$/i.exec(text);
		if (!match || match[2].indexOf("@") !== -1) {
			return null;
		}
		var path = String(match[3] || "").replace(/\/+$/, "");
		return {
			url: match[1].toLowerCase() + "://" + match[2] + path,
			path: path
		};
	}

	function validTicket(value) {
		var text = String(value || "");
		return /^[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9_-]{32,128}$/.test(text) ? text : "";
	}

	function plan(publicBase, ticket, port) {
		var base = cleanPublicBase(publicBase);
		var routeTicket = validTicket(ticket);
		var loopbackPort = Number(port);
		if (!base || !routeTicket || !isFinite(loopbackPort) || loopbackPort < 1 || loopbackPort > 65535
				|| Math.floor(loopbackPort) !== loopbackPort) {
			return null;
		}
		var proxyPath = (base.path || "") + "/gw/" + routeTicket + "/";
		return {
			publicBaseUrl: base.url,
			publicUrl: base.url + "/gw/" + routeTicket + "/",
			viteBase: proxyPath,
			localUrl: "http://127.0.0.1:" + loopbackPort + "/",
			ticket: routeTicket,
			port: loopbackPort
		};
	}

	function stateFields(entry) {
		entry = entry || {};
		return {
			localUrl: String(entry.localUrl || ""),
			publicBaseUrl: String(entry.publicBaseUrl || ""),
			proxyKey: String(entry.proxyKey || ""),
			proxyPath: String(entry.proxyPath || ""),
			proxyActive: entry.proxyActive === true
		};
	}

	return {
		cleanPublicBase: cleanPublicBase,
		validTicket: validTicket,
		plan: plan,
		stateFields: stateFields
	};
}())
