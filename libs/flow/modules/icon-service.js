(function () {
	function isIconifyIcon(icon) {
		return String(icon || "").match(/^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9_.-]+$/) !== null;
	}

	function isUrlIcon(icon) {
		return String(icon || "").match(/^https?:\/\//i) !== null;
	}

	function flowDirForBlock(block, env) {
		var blockFile = String(block && block.__flowFile || "");
		if (blockFile) {
			var dir = new env.File(blockFile).getParentFile();
			if (dir && String(dir.getName()) === "blocks") {
				return dir.getParentFile();
			}
			return dir || env.engineDir();
		}
		return env.engineDir();
	}

	function iconCacheDir(block, family, provider, env) {
		var dir = new env.File(new env.File(flowDirForBlock(block, env), "icons"), family);
		return provider ? new env.File(dir, provider) : dir;
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

	function exposeCachedIconFiles(descriptor, base, extension, env) {
		var svg = new env.File(String(base.getAbsolutePath()) + ".svg");
		var png16 = new env.File(String(base.getAbsolutePath()) + "_16x16.png");
		var png32 = new env.File(String(base.getAbsolutePath()) + "_32x32.png");
		var original = extension ? new env.File(String(base.getAbsolutePath()) + "." + extension) : null;
		if (svg.isFile()) {
			descriptor.iconSvg = env.canonicalPath(svg);
			rasterizeSvg(svg, png16, 16, env);
			rasterizeSvg(svg, png32, 32, env);
		}
		if (png32.isFile()) {
			descriptor.iconFile32 = env.canonicalPath(png32);
			descriptor.iconFile = descriptor.iconFile32;
		}
		if (png16.isFile()) {
			descriptor.iconFile16 = env.canonicalPath(png16);
			descriptor.iconFile = descriptor.iconFile || descriptor.iconFile16;
		}
		if (original && original.isFile()) {
			var path = env.canonicalPath(original);
			if (extension === "svg") {
				descriptor.iconSvg = path;
			}
			if (!descriptor.iconFile && extension !== "bin") {
				descriptor.iconFile = path;
			}
		}
	}

	function rasterizeSvg(svg, png, size, env) {
		if (!svg || !svg.isFile() || !png || png.isFile()) {
			return false;
		}
		if (rasterizeSvgWithBatik(svg, png, size, env)) {
			return true;
		}
		return rasterizeSvgWithCommand(svg, png, size, env);
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

	function fileDataUrl(file, mimeType, env) {
		try {
			if (!file || !file.isFile() || file.length() > 65536) {
				return "";
			}
			var encoded = env.Base64.getEncoder().encodeToString(env.FileUtils.readFileToByteArray(file));
			return "data:" + mimeType + ";base64," + encoded;
		} catch (e) {
			return "";
		}
	}

	function addIconifyCache(block, descriptor, icon, env) {
		var parts = String(icon || "").split(":");
		if (parts.length !== 2) {
			return;
		}
		var provider = safeIconName(parts[0]);
		var name = safeIconName(parts[1]);
		var base = new env.File(iconCacheDir(block, "iconify", provider, env), name);
		var svg = new env.File(String(base.getAbsolutePath()) + ".svg");
		if (!svg.isFile()) {
			downloadToCache("https://api.iconify.design/" + provider + "/" + name + ".svg?color=%2314a7cf", svg, env);
		}
		descriptor.iconify = provider + ":" + name;
		exposeCachedIconFiles(descriptor, base, "svg", env);
	}

	function addUrlIconCache(block, descriptor, icon, env) {
		var ext = urlExtension(icon);
		var base = new env.File(iconCacheDir(block, "url", null, env), env.sha256Hex(icon));
		var file = new env.File(String(base.getAbsolutePath()) + "." + ext);
		downloadToCache(icon, file, env);
		descriptor.iconUrl = icon;
		exposeCachedIconFiles(descriptor, base, ext, env);
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
			descriptor.iconify = icon;
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

	function iconNameFromCacheFile(file) {
		var name = String(file.getName() || "");
		if (name.indexOf(".") === -1) {
			return "";
		}
		name = name.replace(/\.(svg|png|gif|jpg|jpeg|webp|ico)$/i, "");
		name = name.replace(/_(16|32)x(16|32)$/i, "");
		return name;
	}

	function collectIconifyProviderIcons(providerDir, provider, origin, icons, seen, env) {
		var files = providerDir && providerDir.listFiles();
		if (!files) {
			return;
		}
		files = env.Arrays.asList(files).toArray();
		files.forEach(function (file) {
			if (!file.isFile()) {
				return;
			}
			var name = iconNameFromCacheFile(file);
			if (!name || name === ".gitignore") {
				return;
			}
			var id = provider + ":" + name;
			if (seen[id]) {
				return;
			}
			seen[id] = true;
			var icon = {
				id: id,
				provider: provider,
				name: name,
				origin: origin
			};
			var base = new env.File(providerDir, name);
			exposeCachedIconFiles(icon, base, "svg", env);
			var svg = new env.File(String(base.getAbsolutePath()) + ".svg");
			if (svg.isFile()) {
				icon.iconData = fileDataUrl(svg, "image/svg+xml", env);
			}
			icons.push(icon);
		});
	}

	function collectIconifyIcons(flowDir, origin, provider, icons, seen, env) {
		var root = flowDir ? new env.File(new env.File(flowDir, "icons"), "iconify") : null;
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
		providers = env.Arrays.asList(providers).toArray();
		providers.forEach(function (dir) {
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
		collectIconifyIcons(env.projectDir() ? new env.File(env.projectDir(), "libs/flow") : null, "project", provider, icons, seen, env);
		collectIconifyIcons(env.engineDir(), "core", provider, icons, seen, env);
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
