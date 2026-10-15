/*
 * Password hashing of the password.hash and password.verify blocks: PBKDF2 with HMAC-SHA256,
 * 210 000 iterations by default, a 32 byte random salt and a 32 byte derived key, stored as
 * "pbkdf2-sha256$<iterations>$<base64 key>" beside the base64 salt. This is the format of the
 * Convertigo lib_UserManager accounts, so both can read the same documents; verify() also
 * accepts their former SHA-1 hashes (hex of SHA-1(password + "+" + salt)) and reports them as
 * worth an upgrade. Comparisons are constant time and verify() never throws on a malformed hash.
 */
(function () {
	var DEFAULT_ITERATIONS = 210000;
	var MIN_ITERATIONS = 100000;
	var MAX_ITERATIONS = 500000;
	var SALT_BYTES = 32;
	var KEY_BITS = 256;
	var PREFIX = "pbkdf2-sha256$";

	function text(value) {
		return value === undefined || value === null ? "" : String(value);
	}

	function platform() {
		var Base64 = java.util.Base64;
		return {
			randomBytes: function (count) {
				var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, count);
				new java.security.SecureRandom().nextBytes(bytes);
				return bytes;
			},
			encode: function (bytes) {
				return String(Base64.getEncoder().encodeToString(bytes));
			},
			decode: function (encoded) {
				return Base64.getDecoder().decode(String(encoded));
			},
			pbkdf2: function (password, salt, iterations) {
				var spec = new javax.crypto.spec.PBEKeySpec(new java.lang.String(password).toCharArray(), salt, iterations, KEY_BITS);
				try {
					return javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
				} finally {
					spec.clearPassword();
				}
			},
			sha1Hex: function (value) {
				var digest = java.security.MessageDigest.getInstance("SHA-1").digest(new java.lang.String(value).getBytes("UTF-8"));
				var hex = "";
				for (var i = 0; i < digest.length; i++) {
					hex += ("0" + ((digest[i] + 256) % 256).toString(16)).slice(-2);
				}
				return hex;
			},
			utf8Bytes: function (value) {
				return new java.lang.String(String(value)).getBytes("UTF-8");
			},
			equals: function (a, b) {
				return java.security.MessageDigest.isEqual(a, b);
			}
		};
	}

	var api = {};

	// { hash, salt } for a new password
	api.hash = function (options) {
		options = options || {};
		var password = text(options.password);
		if (password === "") {
			throw { code: "PASSWORD_EMPTY", message: "The password is empty" };
		}
		var iterations = options.iterations === undefined || options.iterations === null || options.iterations === ""
			? DEFAULT_ITERATIONS : Number(options.iterations);
		if (!isFinite(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
			throw { code: "PASSWORD_ITERATIONS_INVALID", message: "iterations must be between " + MIN_ITERATIONS + " and " + MAX_ITERATIONS };
		}
		iterations = Math.floor(iterations);
		var salt = platform().randomBytes(SALT_BYTES);
		return {
			hash: PREFIX + iterations + "$" + platform().encode(platform().pbkdf2(password, salt, iterations)),
			salt: platform().encode(salt)
		};
	};

	// { ok, upgrade } for a password against a stored hash and salt; upgrade is true when the
	// stored hash is a former SHA-1 one or uses fewer iterations than the current default
	api.verify = function (options) {
		options = options || {};
		var password = text(options.password);
		var hash = text(options.hash);
		var salt = text(options.salt);
		if (password === "" || hash === "" || salt === "") {
			return { ok: false, upgrade: false };
		}
		try {
			if (hash.indexOf(PREFIX) === 0) {
				var parts = hash.split("$");
				var iterations = Number(parts[1]);
				if (parts.length !== 3 || !/^[0-9]+$/.test(parts[1]) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
					return { ok: false, upgrade: false };
				}
				var saltBytes = platform().decode(salt);
				var expected = platform().decode(parts[2]);
				if (saltBytes.length !== SALT_BYTES || expected.length !== KEY_BITS / 8) {
					return { ok: false, upgrade: false };
				}
				var ok = platform().equals(platform().pbkdf2(password, saltBytes, iterations), expected);
				return { ok: ok, upgrade: ok && iterations < DEFAULT_ITERATIONS };
			}
			if (/^[a-fA-F0-9]{40}$/.test(hash)) {
				var legacy = platform().equals(platform().utf8Bytes(platform().sha1Hex(password + "+" + salt)), platform().utf8Bytes(hash.toLowerCase()));
				return { ok: legacy, upgrade: legacy };
			}
		} catch (e) {
		}
		return { ok: false, upgrade: false };
	};

	return api;
}())
