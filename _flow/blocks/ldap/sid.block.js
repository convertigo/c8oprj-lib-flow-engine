const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:account-search-outline",
  "tags": [
    "ldap",
    "active directory",
    "sid",
  ],
  "summary": "SID of {{sid}}",
  "description": "Decodes an Active Directory security identifier read by ldap.search (objectSid, base64 of the binary value) into its text form, S-1-5-21-…-1430. With Relative id, the last part is replaced: the primary group of a user is its domain SID with primaryGroupID. An invalid value is a Flow error (LDAP_SID_INVALID).",
  "properties": {
    "sid": {
      "label": "Binary SID (base64)",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "The objectSid attribute value as ldap.search returns it (base64).",
    },
    "relativeId": {
      "label": "Relative id",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Replaces the last part of the SID, for example the primaryGroupID of the user to get the SID of its primary group.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
}

(function () {
	function text(ctx, value) {
		var rendered = value === undefined || value === null ? "" : ctx.template(value);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	function unsigned(b) {
		return (b + 256) % 256;
	}

	function decode(base64) {
		var bytes;
		try {
			bytes = java.util.Base64.getDecoder().decode(String(base64));
		} catch (e) {
			return null;
		}
		if (bytes.length < 8) {
			return null;
		}
		var revision = unsigned(bytes[0]);
		var count = unsigned(bytes[1]);
		if (bytes.length !== 8 + 4 * count) {
			return null;
		}
		var authority = 0;
		for (var i = 2; i < 8; i++) {
			authority = authority * 256 + unsigned(bytes[i]);
		}
		var parts = [];
		for (var j = 0; j < count; j++) {
			var offset = 8 + 4 * j;
			parts.push(unsigned(bytes[offset]) + unsigned(bytes[offset + 1]) * 256 + unsigned(bytes[offset + 2]) * 65536 + unsigned(bytes[offset + 3]) * 16777216);
		}
		return { revision: revision, authority: authority, parts: parts };
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var sid = decode(text(ctx, props.sid).trim());
			if (sid === null) {
				return ctx.throwFlow({ code: "LDAP_SID_INVALID", message: "ldap.sid: the value is not a binary security identifier", status: 400 }, node);
			}
			var relative = text(ctx, props.relativeId).trim();
			if (relative !== "") {
				if (!/^\d+$/.test(relative) || sid.parts.length === 0) {
					return ctx.throwFlow({ code: "LDAP_SID_INVALID", message: "ldap.sid: the relative id must be a number", status: 400 }, node);
				}
				sid.parts[sid.parts.length - 1] = Number(relative);
			}
			return "S-" + sid.revision + "-" + sid.authority + (sid.parts.length ? "-" + sid.parts.join("-") : "");
		}
	};
}())
