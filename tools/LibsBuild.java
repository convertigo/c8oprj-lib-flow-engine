/*
 * Copyright (c) 2001-2026 Convertigo SA.
 *
 * This program  is free software; you  can redistribute it and/or
 * Modify  it  under the  terms of the  GNU  Affero General Public
 * License  as published by  the Free Software Foundation;  either
 * version  3  of  the  License,  or  (at your option)  any  later
 * version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY;  without even the implied warranty of
 * MERCHANTABILITY  or  FITNESS  FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this program;
 * if not, see <http://www.gnu.org/licenses/>.
 */

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;

import javax.tools.ToolProvider;

/**
 * Compiles libs/src into libs/build/classes, with the fingerprint of the sources in libs/build/src.sha256, as the export
 * of a project in Convertigo does: a server takes these classes instead of compiling the sources (it compiles them only
 * when the fingerprint differs), and uses them even when it does not compile (server_build none). The sources use only
 * the JDK. Run it from the project folder, before committing a change of libs/src: java tools/LibsBuild.java
 */
public class LibsBuild {
	public static void main(String[] args) throws Exception {
		var project = new File(args.length > 0 ? args[0] : ".").getCanonicalFile();
		var src = new File(project, "libs/src");
		var build = new File(project, "libs/build");
		var classes = new File(build, "classes");
		deleteTree(build.toPath());
		Files.createDirectories(classes.toPath());
		var javaFiles = new ArrayList<String>();
		try (var files = Files.walk(src.toPath())) {
			for (var path : (Iterable<Path>) files::iterator) {
				if (!Files.isRegularFile(path)) {
					continue;
				}
				if (path.getFileName().toString().endsWith(".java")) {
					javaFiles.add(path.toString());
				} else {
					var resource = classes.toPath().resolve(src.toPath().relativize(path).toString());
					Files.createDirectories(resource.getParent());
					Files.copy(path, resource);
				}
			}
		}
		var options = new ArrayList<String>(Arrays.asList("--release", "17", "-encoding", "UTF-8", "-d", classes.getPath()));
		options.addAll(javaFiles);
		if (ToolProvider.getSystemJavaCompiler().run(null, null, null, options.toArray(new String[0])) != 0) {
			throw new IllegalStateException("libs/src does not compile");
		}
		Files.writeString(new File(build, "src.sha256").toPath(), sourcesFingerprint(src));
		System.out.println(javaFiles.size() + " Java source(s) compiled in libs/build, sources " + sourcesFingerprint(src));
	}

	/** The fingerprint of Convertigo ClasspathSnapshot.sourcesFingerprint: keep them identical. */
	static String sourcesFingerprint(File sources) throws IOException {
		try {
			var digest = MessageDigest.getInstance("SHA-256");
			appendDigest(digest, sources, "src");
			return HexFormat.of().formatHex(digest.digest());
		} catch (java.security.NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	private static void appendDigest(MessageDigest digest, File file, String relativePath) throws IOException {
		digest.update(relativePath.getBytes(StandardCharsets.UTF_8));
		digest.update((byte) 0);
		digest.update((byte) (file.isDirectory() ? 'D' : 'F'));
		digest.update((byte) 0);
		if (file.isDirectory()) {
			var children = file.listFiles();
			if (children == null) {
				throw new IOException("Unable to list " + file);
			}
			Arrays.sort(children, (left, right) -> left.getName().compareTo(right.getName()));
			for (var child : children) {
				appendDigest(digest, child, relativePath + "/" + child.getName());
			}
		} else {
			digest.update(Long.toString(file.length()).getBytes(StandardCharsets.UTF_8));
			digest.update((byte) 0);
			var buffer = new byte[65536];
			try (var input = new FileInputStream(file)) {
				int length;
				while ((length = input.read(buffer)) != -1) {
					digest.update(buffer, 0, length);
				}
			}
		}
	}

	private static void deleteTree(Path path) throws IOException {
		if (!Files.exists(path)) {
			return;
		}
		try (var paths = Files.walk(path)) {
			for (var p : (Iterable<Path>) paths.sorted(java.util.Comparator.reverseOrder())::iterator) {
				Files.delete(p);
			}
		}
	}
}
