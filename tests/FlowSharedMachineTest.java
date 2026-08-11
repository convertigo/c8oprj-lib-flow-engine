import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.Script;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

import com.twinsoft.convertigo.engine.flow.FlowEngineBridge;

public class FlowSharedMachineTest {
	private static final int WORKERS = 32;
	private static final String SOURCE = "(function () { var state = 0; return function (delta) { state += delta; return state; }; }())";
	private static final String MODULE_SOURCE = "(function () { var bias = 7; return { advance: function (frame, delta) { var previous = Number(frame.total || 0); frame.total = previous + delta; return bias + frame.total; } }; }())";
	private static final String MACHINE_PAYLOAD = "{\"version\":1,\"nodes\":[{\"id\":\"set\",\"block\":\"set\",\"props\":{\"path\":\"result.value\",\"value\":7}},{\"id\":\"ret\",\"block\":\"return\",\"props\":{\"value\":\"{{ result.value }}\"}}]}";

	private record Result(Script script, double first, double second) {
	}

	private record ModuleResult(Scriptable module, double first, double second, boolean sealed) {
	}

	private record MachineResult(Scriptable image, int firstIndex, int secondIndex, int frameValue,
			boolean sealed, boolean indexHidden) {
	}

	private static com.twinsoft.convertigo.engine.Context contextIdentity() {
		try {
			var field = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
			field.setAccessible(true);
			var unsafe = (sun.misc.Unsafe) field.get(null);
			return (com.twinsoft.convertigo.engine.Context) unsafe
					.allocateInstance(com.twinsoft.convertigo.engine.Context.class);
		} catch (ReflectiveOperationException exception) {
			throw new AssertionError("unable to allocate a constructor-free Convertigo Context fixture", exception);
		}
	}

	public static void main(String[] args) throws Exception {
		FlowEngineBridge.clearCaches();
		ScriptableObject sharedStandardScope;
		var setup = Context.enter();
		try {
			sharedStandardScope = setup.initStandardObjects(null, true);
		} finally {
			Context.exit();
		}

		var barrier = new CyclicBarrier(WORKERS);
		var executor = Executors.newFixedThreadPool(WORKERS);
		var futures = new java.util.ArrayList<java.util.concurrent.Future<Result>>();
		for (var index = 0; index < WORKERS; index++) {
			futures.add(executor.submit(new Callable<Result>() {
				@Override
				public Result call() throws Exception {
					barrier.await(30, TimeUnit.SECONDS);
					var cx = Context.enter();
					try {
						var script = FlowEngineBridge.compileFlowScript(SOURCE, "shared-machine-test", "v1");
						Scriptable frame = cx.newObject(sharedStandardScope);
						frame.setPrototype(sharedStandardScope);
						frame.setParentScope(null);
						var function = (Function) script.exec(cx, frame);
						var first = Context.toNumber(function.call(cx, frame, frame, new Object[] { 1 }));
						var second = Context.toNumber(function.call(cx, frame, frame, new Object[] { 2 }));
						return new Result(script, first, second);
					} finally {
						Context.exit();
					}
				}
			}));
		}
		executor.shutdown();
		if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
			throw new AssertionError("shared machine workers did not terminate");
		}

		Set<Script> scripts = Collections.newSetFromMap(new IdentityHashMap<>());
		for (var future : futures) {
			var result = future.get();
			scripts.add(result.script());
			if (result.first() != 1 || result.second() != 3) {
				throw new AssertionError("request frame leaked or lost its closure state: " + result);
			}
		}
		if (scripts.size() != 1) {
			throw new AssertionError("expected one process-wide Script, got " + scripts.size());
		}

		var info = FlowEngineBridge.flowCompiledScriptCacheInfo();
		if (!info.contains("\"size\":1") || !info.contains("\"writes\":1") || !info.contains("\"misses\":1")) {
			throw new AssertionError("unexpected shared Script cache state: " + info);
		}
		testSharedModule(sharedStandardScope);
		testSharedMachineImage(sharedStandardScope);
		testInvocationFrames();
		System.out.println("Flow shared machine test passed: " + info);
	}

	private static void testInvocationFrames() throws Exception {
		var barrier = new CyclicBarrier(WORKERS);
		var executor = Executors.newFixedThreadPool(WORKERS);
		var futures = new java.util.ArrayList<java.util.concurrent.Future<Void>>();
		for (var index = 0; index < WORKERS; index++) {
			final var worker = index;
			futures.add(executor.submit(new Callable<Void>() {
				@Override
				public Void call() throws Exception {
					barrier.await(30, TimeUnit.SECONDS);
					var parentContext = contextIdentity();
					var childContext = contextIdentity();
					var parentRequest = new Object();
					var parentOverride = new Object();
					var childRequest = new Object();
					try (var parent = FlowEngineBridge.beginFlowInvocationFrame(parentContext, "/project/" + worker)) {
						if (FlowEngineBridge.currentFlowConvertigoContext() != parentContext
								|| !FlowEngineBridge.currentFlowProjectDir().equals("/project/" + worker)
								|| FlowEngineBridge.currentFlowRequestState() != null
								|| FlowEngineBridge.currentFlowInvocationDepth() != 1) {
							throw new AssertionError("parent Flow invocation frame was not isolated for worker " + worker);
						}
						var previousRequest = FlowEngineBridge.setCurrentFlowRequestState(parentRequest);
						if (previousRequest != null || FlowEngineBridge.currentFlowRequestState() != parentRequest) {
							throw new AssertionError("request state was not local to parent worker " + worker);
						}
						var nestedPreviousRequest = FlowEngineBridge.setCurrentFlowRequestState(parentOverride);
						if (nestedPreviousRequest != parentRequest
								|| FlowEngineBridge.currentFlowRequestState() != parentOverride) {
							throw new AssertionError("request override did not preserve parent state for worker " + worker);
						}
						var previous = FlowEngineBridge.setCurrentFlowProjectDir("/override/" + worker);
						if (!previous.equals("/project/" + worker)
								|| !FlowEngineBridge.currentFlowProjectDir().equals("/override/" + worker)) {
							throw new AssertionError("project override was not local to worker " + worker);
						}
						var nestedFailureObserved = false;
						try (var child = FlowEngineBridge.beginFlowInvocationFrame(childContext, "/child/" + worker)) {
							if (FlowEngineBridge.currentFlowConvertigoContext() != childContext
									|| !FlowEngineBridge.currentFlowProjectDir().equals("/child/" + worker)
									|| FlowEngineBridge.currentFlowRequestState() != null
									|| FlowEngineBridge.currentFlowInvocationDepth() != 2) {
								throw new AssertionError("nested Flow invocation frame was not isolated for worker " + worker);
							}
							FlowEngineBridge.setCurrentFlowRequestState(childRequest);
							if (FlowEngineBridge.currentFlowRequestState() != childRequest) {
								throw new AssertionError("child request state was not isolated for worker " + worker);
							}
							throw new ExpectedFlowFailure();
						} catch (ExpectedFlowFailure expected) {
							nestedFailureObserved = true;
						}
						if (!nestedFailureObserved) {
							throw new AssertionError("nested Flow failure was not observed for worker " + worker);
						}
						if (FlowEngineBridge.currentFlowConvertigoContext() != parentContext
								|| !FlowEngineBridge.currentFlowProjectDir().equals("/override/" + worker)
								|| FlowEngineBridge.currentFlowRequestState() != parentOverride
								|| FlowEngineBridge.currentFlowInvocationDepth() != 1) {
							throw new AssertionError("parent Flow invocation frame was not restored for worker " + worker);
						}
						FlowEngineBridge.restoreCurrentFlowRequestState(nestedPreviousRequest);
						if (FlowEngineBridge.currentFlowRequestState() != parentRequest) {
							throw new AssertionError("parent request override was not restored for worker " + worker);
						}
						FlowEngineBridge.restoreCurrentFlowProjectDir(previous);
					}
					var outerFailureObserved = false;
					try (var failed = FlowEngineBridge.beginFlowInvocationFrame(parentContext, "/failed/" + worker)) {
						FlowEngineBridge.setCurrentFlowRequestState(parentRequest);
						throw new ExpectedFlowFailure();
					} catch (ExpectedFlowFailure expected) {
						outerFailureObserved = true;
					}
					if (!outerFailureObserved
							|| FlowEngineBridge.currentFlowConvertigoContext() != null
							|| !FlowEngineBridge.currentFlowProjectDir().isEmpty()
							|| FlowEngineBridge.currentFlowRequestState() != null
							|| FlowEngineBridge.currentFlowInvocationDepth() != 0) {
						throw new AssertionError("Flow invocation frame leaked after worker " + worker);
					}
					return null;
				}
			}));
		}
		executor.shutdown();
		if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
			throw new AssertionError("Flow invocation frame workers did not terminate");
		}
		for (var future : futures) {
			future.get();
		}
		System.out.println("Flow invocation frame test passed with " + WORKERS + " concurrent workers");
	}

	private static final class ExpectedFlowFailure extends RuntimeException {
		private static final long serialVersionUID = 1L;
	}

	private static void testSharedModule(ScriptableObject sharedStandardScope) throws Exception {
		FlowEngineBridge.clearCaches();
		var barrier = new CyclicBarrier(WORKERS);
		var executor = Executors.newFixedThreadPool(WORKERS);
		var futures = new java.util.ArrayList<java.util.concurrent.Future<ModuleResult>>();
		for (var index = 0; index < WORKERS; index++) {
			futures.add(executor.submit(new Callable<ModuleResult>() {
				@Override
				public ModuleResult call() throws Exception {
					barrier.await(30, TimeUnit.SECONDS);
					var cx = Context.enter();
					try {
						var module = FlowEngineBridge.sharedFlowModule(MODULE_SOURCE, "shared-module-test", "v1");
						var advance = (Function) ScriptableObject.getProperty(module, "advance");
						var frame = cx.newObject(sharedStandardScope);
						frame.setPrototype(sharedStandardScope);
						frame.setParentScope(null);
						var first = Context.toNumber(advance.call(cx, module, module, new Object[] { frame, 1 }));
						var second = Context.toNumber(advance.call(cx, module, module, new Object[] { frame, 2 }));
						return new ModuleResult(module, first, second,
								module instanceof ScriptableObject object && object.isSealed());
					} finally {
						Context.exit();
					}
				}
			}));
		}
		executor.shutdown();
		if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
			throw new AssertionError("shared module workers did not terminate");
		}
		Set<Scriptable> modules = Collections.newSetFromMap(new IdentityHashMap<>());
		for (var future : futures) {
			var result = future.get();
			modules.add(result.module());
			if (result.first() != 8 || result.second() != 10 || !result.sealed()) {
				throw new AssertionError("shared module leaked frame state or was not sealed: " + result);
			}
		}
		if (modules.size() != 1) {
			throw new AssertionError("expected one process-wide module, got " + modules.size());
		}
		var info = FlowEngineBridge.flowSharedModuleCacheInfo();
		if (!info.contains("\"size\":1") || !info.contains("\"writes\":1") || !info.contains("\"misses\":1")) {
			throw new AssertionError("unexpected shared module cache state: " + info);
		}
		System.out.println("Flow shared module test passed: " + info);
	}

	private static void testSharedMachineImage(ScriptableObject sharedStandardScope) throws Exception {
		FlowEngineBridge.clearCaches();
		var barrier = new CyclicBarrier(WORKERS);
		var executor = Executors.newFixedThreadPool(WORKERS);
		var futures = new java.util.ArrayList<java.util.concurrent.Future<MachineResult>>();
		for (var index = 0; index < WORKERS; index++) {
			final var worker = index;
			futures.add(executor.submit(new Callable<MachineResult>() {
				@Override
				public MachineResult call() throws Exception {
					barrier.await(30, TimeUnit.SECONDS);
					var cx = Context.enter();
					try {
						var image = FlowEngineBridge.getFlowMachineImage("machine-v1");
						if (image == null) {
							image = FlowEngineBridge.putFlowMachineImage("machine-v1", MACHINE_PAYLOAD);
						}
						var nodes = (Scriptable) ScriptableObject.getProperty(image, "nodes");
						var first = (Scriptable) nodes.get(0, nodes);
						var second = (Scriptable) nodes.get(1, nodes);
						var firstIndex = (int) Context.toNumber(ScriptableObject.getProperty(first, "__flowMachineNodeIndex"));
						var secondIndex = (int) Context.toNumber(ScriptableObject.getProperty(second, "__flowMachineNodeIndex"));
						var hidden = java.util.Arrays.stream(first.getIds())
								.noneMatch(id -> "__flowMachineNodeIndex".equals(String.valueOf(id)));
						var frame = cx.newObject(sharedStandardScope);
						ScriptableObject.putProperty(frame, "value", worker);
						return new MachineResult(image, firstIndex, secondIndex,
								(int) Context.toNumber(ScriptableObject.getProperty(frame, "value")),
								image instanceof ScriptableObject object && object.isSealed(), hidden);
					} finally {
						Context.exit();
					}
				}
			}));
		}
		executor.shutdown();
		if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
			throw new AssertionError("shared machine image workers did not terminate");
		}
		Set<Scriptable> images = Collections.newSetFromMap(new IdentityHashMap<>());
		for (var future : futures) {
			var result = future.get();
			images.add(result.image());
			if (result.firstIndex() != 0 || result.secondIndex() != 1 || !result.sealed()
					|| !result.indexHidden() || result.frameValue() < 0 || result.frameValue() >= WORKERS) {
				throw new AssertionError("invalid shared machine image or request frame: " + result);
			}
		}
		if (images.size() != 1) {
			throw new AssertionError("expected one process-wide machine image, got " + images.size());
		}
		var info = FlowEngineBridge.flowMachineImageCacheInfo();
		if (!info.contains("\"size\":1") || !info.contains("\"writes\":1") || !info.contains("\"nodes\":2")) {
			throw new AssertionError("unexpected shared machine image cache state: " + info);
		}
		System.out.println("Flow shared machine image test passed: " + info);
	}
}
