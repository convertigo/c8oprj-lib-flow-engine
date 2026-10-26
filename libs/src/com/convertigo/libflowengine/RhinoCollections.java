/* Copyright (c) 2001-2026 Convertigo SA. AGPL-3.0-or-later. */
package com.convertigo.libflowengine;

import java.util.*;
import org.mozilla.javascript.*;

/** Request-local collection facades over ordinary Rhino values. No secondary data tree. */
final class RhinoCollections {
	private RhinoCollections() { }
	static Object read(Object value, Scriptable scope) {
		if (value instanceof NativeArray array) return new ArrayView(array, scope);
		if (value instanceof NativeObject object) return new ObjectView(object, scope);
		if (value instanceof CharSequence text) return text.toString();
		return value;
	}
	static Object unwrap(Object value, Scriptable scope) {
		if (value instanceof ObjectView object) return object.value;
		if (value instanceof ArrayView array) return array.value;
		if (value instanceof Map<?, ?> map) {
			var out = object(scope);
			for (var entry : map.entrySet()) out.put((String) entry.getKey(), entry.getValue());
			return out.value;
		}
		if (value instanceof List<?> list) {
			var out = array(scope);
			for (var item : list) out.add(item);
			return out.value;
		}
		return value;
	}
	static ObjectView object(Scriptable scope) { return new ObjectView((NativeObject) Context.getCurrentContext().newObject(scope), scope); }
	static ArrayView array(Scriptable scope) { return new ArrayView((NativeArray) Context.getCurrentContext().newArray(scope, 0), scope); }
	static final class ObjectView extends AbstractMap<String, Object> {
		final NativeObject value;
		final Scriptable scope;
		ObjectView(NativeObject value, Scriptable scope) { this.value = value; this.scope = scope; }
		private Object own(String name) {
			long index = ScriptRuntime.indexFromString(name);
			return index >= 0 && index <= Integer.MAX_VALUE ? value.get((int) index, value) : value.get(name, value);
		}
		@Override public Object get(Object key) { var item = own((String) key); return item == Scriptable.NOT_FOUND ? null : read(item, scope); }
		@Override public boolean containsKey(Object key) { return own((String) key) != Scriptable.NOT_FOUND; }
		@Override public Object put(String key, Object item) {
			var previous = get(key);
			// Public own-property API, including __proto__ and integer keys.
			value.defineOwnProperty(Context.getCurrentContext(), key, new ScriptableObject.DescriptorInfo(true, true, true, unwrap(item, scope)));
			return previous;
		}
		@Override public Set<Entry<String, Object>> entrySet() {
			return new AbstractSet<>() {
				@Override public int size() { return value.getIds().length; }
				@Override public Iterator<Entry<String, Object>> iterator() {
					var ids = value.getIds();
					return new Iterator<>() {
						int index;
						@Override public boolean hasNext() { return index < ids.length; }
						@Override public Entry<String, Object> next() { var key = ids[index++].toString(); return new SimpleImmutableEntry<>(key, get(key)); }
					};
				}
			};
		}
	}
	static final class ArrayView extends AbstractList<Object> {
		final NativeArray value;
		final Scriptable scope;
		ArrayView(NativeArray value, Scriptable scope) { this.value = value; this.scope = scope; }
		@Override public int size() { return Math.toIntExact(value.getLength()); }
		@Override public Object get(int index) { Objects.checkIndex(index, size()); return read(value.get(index, value), scope); }
		@Override public void add(int index, Object item) {
			if (index != size()) throw new UnsupportedOperationException("Kernel arrays append only");
			value.put(index, value, unwrap(item, scope));
		}
	}
}
