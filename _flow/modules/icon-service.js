(function () {
	// Icons are sources of the project that uses them, stored as SVG only:
	//   <project>/_flow/icons/iconify/<set>/<name>.svg (+ LICENSE.json of the set)
	//   <project>/_flow/icons/url/<sha256>.<ext>
	// They travel with the project (git, .car). Resolution looks in the project, then
	// in its referenced projects and lib_flow_engine, then in the server cache, and only
	// then downloads. Studio renderings (tinted SVG, 16/32 PNG) are derived into the
	// server cache and never written into a project.
	var STUDIO_TINT = "#14a7cf";
	var projectCopies = {};
	// Without Batik nor a raster command (a server image), PNG renderings cannot be made:
	// the tinted SVG is published instead, and rasterization is not retried on every
	// resolution (each attempt forks several missing commands). Marker valid one day.
	var RASTER_UNAVAILABLE_MS = 24 * 3600 * 1000;
	var rasterUnavailable = null;

	function rasterMarker(env) {
		var dir = sharedDir("studio", null, env);
		return dir ? new env.File(dir, ".raster-unavailable") : null;
	}

	function isRasterUnavailable(env) {
		if (rasterUnavailable === null) {
			var marker = rasterMarker(env);
			rasterUnavailable = !!marker && marker.isFile()
				&& new Date().getTime() - Number(marker.lastModified()) < RASTER_UNAVAILABLE_MS;
		}
		return rasterUnavailable;
	}

	function markRasterUnavailable(env) {
		rasterUnavailable = true;
		var marker = rasterMarker(env);
		try {
			if (marker) {
				marker.getParentFile().mkdirs();
				env.FileUtils.writeStringToFile(marker, new Date().toISOString(), "UTF-8");
			}
		} catch (ignored) {
		}
	}

	function isIconifyIcon(icon) {
		return String(icon || "").match(/^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9_.-]+$/) !== null;
	}

	function isUrlIcon(icon) {
		return String(icon || "").match(/^https?:\/\//i) !== null;
	}

	function sharedDir(family, provider, env) {
		if (!env.sharedIconCacheRoot) {
			return null;
		}
		var dir = new env.File(env.sharedIconCacheRoot, family);
		return provider ? new env.File(dir, provider) : dir;
	}

	// The project owning a source: the parent of its Flow source root directory.
	function ownerProjectRoot(block, env) {
		var file = String(block && block.__flowFile || "");
		for (var dir = file ? new env.File(file).getParentFile() : null; dir; dir = dir.getParentFile()) {
			if (String(dir.getName()) === env.sourcePaths.root) {
				return dir.getParentFile();
			}
		}
		return null;
	}

	function sameFile(left, right, env) {
		return !!left && !!right && env.canonicalPath(left) === env.canonicalPath(right);
	}

	function projectIconFile(projectRoot, relative, env) {
		return new env.File(new env.File(projectRoot, env.sourcePaths.path("icons")), relative);
	}

	// Where an icon may already travel: the project, its references, lib_flow_engine.
	function iconSourceRoots(block, env) {
		var roots = [];
		function add(root) {
			if (root && !roots.some(function (known) { return sameFile(known, root, env); })) {
				roots.push(root);
			}
		}
		add(ownerProjectRoot(block, env));
		add(env.projectDir && env.projectDir());
		(typeof env.iconReferenceRoots === "function" ? env.iconReferenceRoots() : []).forEach(add);
		add(env.engineDir().getParentFile());
		return roots;
	}

	function copyFileQuietly(source, target, env) {
		try {
			if (source && source.isFile() && !target.isFile()) {
				target.getParentFile().mkdirs();
				env.FileUtils.copyFile(source, target);
			}
		} catch (ignored) {
		}
		return target.isFile();
	}

	function safeIconName(name) {
		return String(name || "").replace(/[^A-Za-z0-9_.-]/g, "_");
	}

	function urlExtension(icon) {
		var path = String(icon || "").replace(/[?#].*$/, "");
		var dot = path.lastIndexOf(".");
		var ext = dot === -1 ? "" : path.substring(dot + 1).toLowerCase();
		if (["svg", "png", "jpg", "jpeg", "gif", "webp", "ico"].indexOf(ext) === -1) {
			return "bin";
		}
		return ext;
	}

	function downloadToCache(url, file, env) {
		if (file.isFile()) {
			return true;
		}
		var failureMarker = new env.File(String(file.getAbsolutePath()) + ".failed");
		if (failureMarker.isFile() && Number(new Date().getTime()) - Number(failureMarker.lastModified()) < 3600000) {
			return false;
		}
		try {
			file.getParentFile().mkdirs();
			env.FileUtils.copyURLToFile(new Packages.java.net.URL(String(url)), file, 800, 2000);
			if (failureMarker.isFile()) {
				env.FileUtils.deleteQuietly(failureMarker);
			}
			return file.isFile();
		} catch (e) {
			try {
				file.getParentFile().mkdirs();
				env.FileUtils.writeStringToFile(failureMarker, String(e), "UTF-8");
			} catch (ignored) {
			}
			return false;
		}
	}

	function iconifyLicenseFile(dir, env) {
		return new env.File(dir, "LICENSE.json");
	}

	// Iconify publishes the license of each icon set: it travels with its icons.
	function downloadIconifyLicense(provider, dir, env) {
		var license = iconifyLicenseFile(dir, env);
		var raw = new env.File(dir, "collection.json");
		if (license.isFile() || !downloadToCache("https://api.iconify.design/collections?prefixes=" + provider, raw, env)) {
			return;
		}
		try {
			var info = JSON.parse(String(env.FileUtils.readFileToString(raw, "UTF-8")))[provider] || {};
			env.FileUtils.writeStringToFile(license, JSON.stringify({
				prefix: provider,
				name: info.name || provider,
				author: info.author || null,
				license: info.license || null
			}, null, 2) + "\n", "UTF-8");
		} catch (ignored) {
		} finally {
			env.FileUtils.deleteQuietly(raw);
		}
	}

	// The original SVG (currentColor), from a project that carries it or from the server cache.
	function rawIconFile(block, family, provider, fileName, download, env) {
		var relative = family + "/" + (provider ? provider + "/" : "") + fileName;
		var cacheDir = sharedDir(family, provider, env);
		var cached = cacheDir ? new env.File(cacheDir, fileName) : null;
		var roots = iconSourceRoots(block, env);
		for (var i = 0; i < roots.length; i++) {
			var carried = projectIconFile(roots[i], relative, env);
			if (carried.isFile()) {
				if (cached) {
					copyFileQuietly(carried, cached, env);
					copyFileQuietly(iconifyLicenseFile(carried.getParentFile(), env), iconifyLicenseFile(cacheDir, env), env);
				}
				return carried;
			}
		}
		if (!cached) {
			return null;
		}
		if (!cached.isFile() && download) {
			download(cached);
		}
		return cached.isFile() ? cached : null;
	}

	// A saved source of the current project carries the icons it uses (SVG and license).
	function ensureProjectCopy(block, family, provider, fileName, rawSupplier, env) {
		var owner = ownerProjectRoot(block, env);
		var current = env.projectDir && env.projectDir();
		if (!owner || !sameFile(owner, current, env)) {
			return;
		}
		var sourceFile = new env.File(String(block.__flowFile));
		if (!sourceFile.isFile() && block.__flowIconSaved !== true) {
			return;
		}
		var relative = family + "/" + (provider ? provider + "/" : "") + fileName;
		var key = env.canonicalPath(owner) + "|" + relative;
		if (projectCopies[key]) {
			return;
		}
		var target = projectIconFile(owner, relative, env);
		if (target.isFile()) {
			projectCopies[key] = true;
			return;
		}
		var raw = rawSupplier();
		if (copyFileQuietly(raw, target, env)) {
			copyFileQuietly(iconifyLicenseFile(raw.getParentFile(), env), iconifyLicenseFile(target.getParentFile(), env), env);
			projectCopies[key] = true;
		}
	}

	// Studio rendering: tinted SVG plus 16/32 PNG, derived into the server cache.
	function studioRendering(descriptor, raw, family, provider, name, extension, env) {
		var dir = sharedDir("studio/" + family, provider, env);
		if (!dir || !raw) {
			return false;
		}
		var base = new env.File(dir, name);
		var svg = new env.File(String(base.getAbsolutePath()) + ".svg");
		var png16 = new env.File(String(base.getAbsolutePath()) + "_16x16.png");
		var png32 = new env.File(String(base.getAbsolutePath()) + "_32x32.png");
		if (extension === "svg") {
			if (!svg.isFile()) {
				try {
					var text = String(env.FileUtils.readFileToString(raw, "UTF-8"));
					svg.getParentFile().mkdirs();
					env.FileUtils.writeStringToFile(svg, text.replace(/currentColor/g, STUDIO_TINT), "UTF-8");
				} catch (ignored) {
					return false;
				}
			}
			rasterizeSvg(svg, png16, 16, env);
			rasterizeSvg(svg, png32, 32, env);
			descriptor.iconSvg = env.canonicalPath(svg);
		} else if (extension !== "bin") {
			descriptor.iconFile = env.canonicalPath(raw);
		}
		if (png32.isFile()) {
			descriptor.iconFile32 = env.canonicalPath(png32);
			descriptor.iconFile = descriptor.iconFile32;
		}
		if (png16.isFile()) {
			descriptor.iconFile16 = env.canonicalPath(png16);
			descriptor.iconFile = descriptor.iconFile || descriptor.iconFile16;
		}
		if (!descriptor.iconFile && descriptor.iconSvg) {
			descriptor.iconFile = descriptor.iconSvg;
		}
		return true;
	}

	function exposeCompleteStudioRendering(descriptor, family, provider, name, env) {
		var dir = sharedDir("studio/" + family, provider, env);
		if (!dir) {
			return false;
		}
		var base = String(new env.File(dir, name).getAbsolutePath());
		var svg = new env.File(base + ".svg");
		var png16 = new env.File(base + "_16x16.png");
		var png32 = new env.File(base + "_32x32.png");
		if (!svg.isFile()) {
			return false;
		}
		if (!png16.isFile() || !png32.isFile()) {
			if (!isRasterUnavailable(env)) {
				return false;
			}
			descriptor.iconSvg = env.canonicalPath(svg);
			descriptor.iconFile = descriptor.iconSvg;
			return true;
		}
		descriptor.iconSvg = env.canonicalPath(svg);
		descriptor.iconFile16 = env.canonicalPath(png16);
		descriptor.iconFile32 = env.canonicalPath(png32);
		descriptor.iconFile = descriptor.iconFile32;
		return true;
	}

	function addIconifyCache(block, descriptor, icon, env) {
		var parts = String(icon || "").split(":");
		if (parts.length !== 2) {
			return;
		}
		var provider = safeIconName(parts[0]);
		var name = safeIconName(parts[1]);
		descriptor.iconify = provider + ":" + name;
		var raw = null;
		// Resolving the same MDI icons hundreds of times: the complete Studio rendering
		// is the fast path (three stats); the raw SVG is looked up only when needed.
		if (!exposeCompleteStudioRendering(descriptor, "iconify", provider, name, env)) {
			raw = rawIconFile(block, "iconify", provider, name + ".svg", function (target) {
				if (downloadToCache("https://api.iconify.design/" + provider + "/" + name + ".svg", target, env)) {
					downloadIconifyLicense(provider, target.getParentFile(), env);
				}
			}, env);
			studioRendering(descriptor, raw, "iconify", provider, name, "svg", env);
		}
		ensureProjectCopy(block, "iconify", provider, name + ".svg", function () {
			return raw || rawIconFile(block, "iconify", provider, name + ".svg", null, env);
		}, env);
	}

	function addUrlIconCache(block, descriptor, icon, env) {
		var ext = urlExtension(icon);
		var name = env.sha256Hex(icon);
		var raw = rawIconFile(block, "url", null, name + "." + ext, function (target) {
			downloadToCache(icon, target, env);
		}, env);
		descriptor.iconUrl = icon;
		studioRendering(descriptor, raw, "url", null, name, ext, env);
		ensureProjectCopy(block, "url", null, name + "." + ext, function () { return raw; }, env);
	}

	function rasterizeSvg(svg, png, size, env) {
		if (!svg || !svg.isFile() || !png || png.isFile() || isRasterUnavailable(env)) {
			return false;
		}
		if (rasterizeSvgWithBatik(svg, png, size, env) || rasterizeSvgWithCommand(svg, png, size, env)) {
			return true;
		}
		markRasterUnavailable(env);
		return false;
	}

	function rasterizeSvgWithBatik(svg, png, size, env) {
		try {
			Packages.java.lang.Class.forName("org.w3c.dom.svg.SVGDocument");
			png.getParentFile().mkdirs();
			var transcoder = new Packages.org.apache.batik.transcoder.image.PNGTranscoder();
			transcoder.addTranscodingHint(Packages.org.apache.batik.transcoder.image.PNGTranscoder.KEY_WIDTH, java.lang.Float.valueOf(size));
			transcoder.addTranscodingHint(Packages.org.apache.batik.transcoder.image.PNGTranscoder.KEY_HEIGHT, java.lang.Float.valueOf(size));
			var input = new Packages.org.apache.batik.transcoder.TranscoderInput(svg.toURI().toString());
			var outputStream = new Packages.java.io.FileOutputStream(png);
			try {
				var output = new Packages.org.apache.batik.transcoder.TranscoderOutput(outputStream);
				transcoder.transcode(input, output);
			} finally {
				outputStream.close();
			}
			return png.isFile();
		} catch (e) {
			try {
				env.FileUtils.deleteQuietly(png);
			} catch (ignored) {
			}
			return false;
		}
	}

	function runRasterCommand(args, png, env) {
		try {
			png.getParentFile().mkdirs();
			var pb = new Packages.java.lang.ProcessBuilder(args);
			pb.redirectErrorStream(true);
			var process = pb.start();
			process.waitFor();
			return png.isFile();
		} catch (e) {
			try {
				env.FileUtils.deleteQuietly(png);
			} catch (ignored) {
			}
			return false;
		}
	}

	function rasterizeSvgWithCommand(svg, png, size, env) {
		var source = String(svg.getAbsolutePath());
		var target = String(png.getAbsolutePath());
		var commands = [
			["magick", source, "-background", "none", "-resize", size + "x" + size, target],
			["convert", source, "-background", "none", "-resize", size + "x" + size, target],
			["rsvg-convert", "-w", String(size), "-h", String(size), "-o", target, source],
			["sips", "-s", "format", "png", "-z", String(size), String(size), source, "--out", target]
		];
		for (var i = 0; i < commands.length; i++) {
			if (runRasterCommand(commands[i], png, env)) {
				return true;
			}
		}
		return false;
	}

	function exposeLocalIcon(descriptor, iconFile, env) {
		if (!iconFile || !iconFile.isFile()) {
			return;
		}
		var path = env.canonicalPath(iconFile);
		var ext = urlExtension(path);
		if (ext === "svg") {
			descriptor.iconSvg = path;
		}
		descriptor.iconFile = path;
		if (String(iconFile.getName()).indexOf("_16x16.") !== -1) {
			descriptor.iconFile16 = path;
		}
		if (String(iconFile.getName()).indexOf("_32x32.") !== -1) {
			descriptor.iconFile32 = path;
		}
	}

	function resolveBlockIcon(block, descriptor, env) {
		var icon = descriptor && descriptor.icon !== undefined ? String(descriptor.icon || "").trim() : "";
		if (!icon) {
			return descriptor;
		}
		descriptor.icon = icon;
		if (isIconifyIcon(icon)) {
			addIconifyCache(block, descriptor, icon, env);
			return descriptor;
		}
		if (isUrlIcon(icon)) {
			addUrlIconCache(block, descriptor, icon, env);
			return descriptor;
		}
		if (icon.indexOf("/com/twinsoft/convertigo/") === 0) {
			descriptor.iconFile = icon;
			return descriptor;
		}
		var iconFile = new env.File(icon);
		if (!iconFile.isAbsolute()) {
			var blockFile = String(block && block.__flowFile || "");
			var baseDir = blockFile ? new env.File(blockFile).getParentFile() : env.engineDir();
			iconFile = new env.File(baseDir, icon);
		}
		exposeLocalIcon(descriptor, iconFile, env);
		return descriptor;
	}

	function collectIconifyProviderIcons(providerDir, provider, origin, icons, seen, env) {
		var files = providerDir && providerDir.listFiles();
		if (!files) {
			return;
		}
		env.Arrays.asList(files).toArray().forEach(function (file) {
			var fileName = String(file.getName());
			if (!file.isFile() || !/\.svg$/i.test(fileName)) {
				return;
			}
			var name = fileName.replace(/\.svg$/i, "");
			var id = provider + ":" + name;
			if (seen[id]) {
				return;
			}
			seen[id] = true;
			var icon = { id: id, provider: provider, name: name, origin: origin, iconSvg: env.canonicalPath(file) };
			// The picker shows the Studio tint, computed in memory from the carried SVG.
			try {
				if (file.length() <= 65536) {
					var text = String(env.FileUtils.readFileToString(file, "UTF-8")).replace(/currentColor/g, STUDIO_TINT);
					icon.iconData = "data:image/svg+xml;base64," + env.Base64.getEncoder()
						.encodeToString(new Packages.java.lang.String(text).getBytes("UTF-8"));
				}
			} catch (ignored) {
			}
			icons.push(icon);
		});
	}

	function collectIconifyIcons(projectRoot, origin, provider, icons, seen, env) {
		var root = projectRoot ? projectIconFile(projectRoot, "iconify", env) : null;
		if (!root || !root.isDirectory()) {
			return;
		}
		if (provider) {
			collectIconifyProviderIcons(new env.File(root, safeIconName(provider)), safeIconName(provider), origin, icons, seen, env);
			return;
		}
		var providers = root.listFiles();
		if (!providers) {
			return;
		}
		env.Arrays.asList(providers).toArray().forEach(function (dir) {
			if (dir.isDirectory()) {
				collectIconifyProviderIcons(dir, String(dir.getName()), origin, icons, seen, env);
			}
		});
	}

	function iconCatalogRequest(request, env) {
		request = request || {};
		var provider = String(request.provider || "mdi").trim();
		var query = String(request.query || "").trim().toLowerCase();
		var limit = Math.max(1, Math.min(Number(request.limit || 200), 500));
		var icons = [];
		var seen = {};
		collectIconifyIcons(env.projectDir(), "project", provider, icons, seen, env);
		(typeof env.iconReferenceRoots === "function" ? env.iconReferenceRoots() : []).forEach(function (root) {
			collectIconifyIcons(root, "reference", provider, icons, seen, env);
		});
		collectIconifyIcons(env.engineDir().getParentFile(), "core", provider, icons, seen, env);
		icons.sort(function (a, b) {
			return String(a.id).localeCompare(String(b.id));
		});
		if (query) {
			icons = icons.filter(function (icon) {
				return String(icon.id).toLowerCase().indexOf(query) !== -1;
			});
		}
		return {
			ok: true,
			provider: provider,
			count: icons.length,
			icons: icons.slice(0, limit)
		};
	}

	return {
		resolveBlockIcon: resolveBlockIcon,
		iconCatalogRequest: iconCatalogRequest
	};
})();
