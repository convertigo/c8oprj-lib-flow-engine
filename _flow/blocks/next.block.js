const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:skip-next",
  "description": "Ends the current item of the enclosing forEach or while: the loop goes on with the next item. A bare return in the body of forEach or while is this block, as return in a JavaScript forEach callback.",
  "summary": "next item",
  "longDescription": "In FlowScript, write return in the body of forEach, while or file.forEachLine: if (current.done) { return } skips that item and the loop goes on. The rest of the body is not run for that item; the Flow goes on after the loop. To leave the whole Flow from a loop, set a local in the loop and test it after the loop. Outside a loop body this block is refused (FLOW_NEXT_OUTSIDE_LOOP).",
  "properties": {},
  "runtime": "rhino",
  "outputs": {},
}

(function () {
	return {
		stateless: true,
		run: function (ctx, node) {
			// forEach, while and file.forEachLine count the bodies they run and clear the skip after each item.
			if (!(ctx.loopDepth > 0)) {
				ctx.throwFlow({ code: "FLOW_NEXT_OUTSIDE_LOOP", message: "next (a bare return in a loop body) runs only in the body of forEach, while or file.forEachLine.", status: 500 }, node);
			}
			ctx.skipping = true;
			ctx.stopped = true;
		},
		debug: {
			resolve: function (ctx, node) {
				return {};
			},
			run: function (ctx, node) {
				// forEach, while and file.forEachLine count the bodies they run and clear the skip after each item.
				if (!(ctx.loopDepth > 0)) {
					ctx.throwFlow(
						{
							code: "FLOW_NEXT_OUTSIDE_LOOP",
							message:
								"next (a bare return in a loop body) runs only in the body of forEach, while or file.forEachLine.",
							status: 500
						},
						node
					);
				}
				ctx.skipping = true;
				ctx.stopped = true;
			}
		}
	};
}())
