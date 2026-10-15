/*
 * The public URL of this server, as the links sent by email must carry it: never the host of
 * the request (a caller could make a genuine email carry the key of an account to another
 * site). endpoint.current reads the sources and this library picks the first trusted one:
 *
 *   1. the URL configured by the project (its config, usually a global symbol);
 *   2. the environment variable CONVERTIGO_PUBLIC_URL;
 *   3. the engine property "Convertigo Server endpoint URL";
 *   4. the engine property "Convertigo Server local URL" (set by C8oCloud), unless it targets
 *      the local host, its default outside a configured server;
 *   5. in the Studio only, the URL of the request (a developer workstation).
 *
 * publicUrl(settings) returns { url, source } with the url ending with a slash, or null when
 * no source is trusted; an invalid configured value is an error.
 */
(function () {
	var PATTERN = /^https?:\/\/[^\/\s?#@\\]+(\/[^\s?#\\]*)?$/;

	function cleaned(value) {
		var text = value === undefined || value === null ? "" : String(value).trim();
		// an environment variable the engine could not resolve stays as %NAME%
		return text === "" || /%[^%\s]*%/.test(text) ? null : text;
	}

	function isLocal(url) {
		var host = String(url).replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
		host = host.charAt(0) === "[" ? host.substring(0, host.indexOf("]") + 1) : host.split(":")[0];
		return host === "localhost" || /\.localhost$/.test(host) || /^127\./.test(host)
			|| host === "[::1]" || host === "0.0.0.0" || host === "[::]";
	}

	function base(value, source) {
		if (!PATTERN.test(value)) {
			throw { code: "PUBLIC_URL_INVALID", message: "Invalid public URL (" + source + "): " + value, status: 500 };
		}
		return { url: value.charAt(value.length - 1) === "/" ? value : value + "/", source: source };
	}

	// settings: configured, environment, endpoint, localUrl, studio (boolean), requestUrl
	function publicUrl(settings) {
		settings = settings || {};
		var candidates = [
			["configuration", settings.configured],
			["CONVERTIGO_PUBLIC_URL", settings.environment],
			["Convertigo Server endpoint URL", settings.endpoint]
		];
		for (var i = 0; i < candidates.length; i++) {
			var value = cleaned(candidates[i][1]);
			if (value !== null) {
				return base(value, candidates[i][0]);
			}
		}
		var localUrl = cleaned(settings.localUrl);
		if (localUrl !== null && PATTERN.test(localUrl) && !isLocal(localUrl)) {
			return base(localUrl, "Convertigo Server local URL");
		}
		if (settings.studio === true) {
			var requestUrl = cleaned(settings.requestUrl);
			if (requestUrl !== null && PATTERN.test(requestUrl)) {
				return base(requestUrl, "Studio request");
			}
		}
		return null;
	}

	return { publicUrl: publicUrl, isLocal: isLocal };
}())
