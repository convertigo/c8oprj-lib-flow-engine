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

package com.convertigo.libflowengine;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.attribute.BasicFileAttributes;
import java.text.Collator;
import java.util.Arrays;
import java.util.Locale;

/**
 * The fingerprints of the Flow engine computed in Java: the same strings as _flow/modules/fingerprint-utils.js, which
 * remains the fallback when these classes are not compiled. A directory is walked with one file system call per entry,
 * instead of four calls from Rhino, each a remote call on a network file system.
 */
public final class Fingerprints {
	private Fingerprints() {
	}

	/**
	 * @return the fingerprint of a directory: its canonical path, then each folder ("d:path:lastModified") and file
	 *         ("f:path:lastModified:length") under it, sorted by name as String.localeCompare sorts them in Rhino
	 */
	public static String directory(String path) {
		var dir = new File(path);
		if (!dir.exists()) {
			return "missing:" + canonicalPath(dir);
		}
		var parts = new StringBuilder(canonicalPath(dir));
		var collator = Collator.getInstance(Locale.getDefault());
		walkChildren(dir, "", parts, collator);
		return parts.toString();
	}

	private static void walkChildren(File dir, String prefix, StringBuilder parts, Collator collator) {
		var children = dir.listFiles();
		if (children == null) {
			return;
		}
		Arrays.sort(children, (a, b) -> collator.compare(a.getName(), b.getName()));
		for (var child : children) {
			var path = prefix.isEmpty() ? child.getName() : prefix + "/" + child.getName();
			BasicFileAttributes attributes;
			try {
				attributes = Files.readAttributes(child.toPath(), BasicFileAttributes.class);
			} catch (IOException | RuntimeException e) {
				// a dangling link, or an entry removed meanwhile: neither a folder nor a file
				continue;
			}
			if (attributes.isDirectory()) {
				parts.append("|d:").append(path).append(':').append(attributes.lastModifiedTime().toMillis());
				walkChildren(child, path, parts, collator);
			} else if (attributes.isRegularFile()) {
				parts.append("|f:").append(path).append(':').append(attributes.lastModifiedTime().toMillis())
						.append(':').append(attributes.size());
			}
		}
	}

	private static String canonicalPath(File file) {
		try {
			return file.getCanonicalPath();
		} catch (IOException e) {
			return file.getAbsolutePath();
		}
	}
}
