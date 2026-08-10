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

	private record Result(Script script, double first, double second) {
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
		System.out.println("Flow shared machine test passed: " + info);
	}
}
