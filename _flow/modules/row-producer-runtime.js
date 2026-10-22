(function (blocks, input, entry, finish) {
	// Only immutable block implementations and detached inputs enter this realm.
	// Values are literal: a cell containing {{...}} never becomes executable input.
	var state = {}, count = 0;
	var ctx = {
		props: function (node) { return node.props; },
		template: function (value) { return value; },
		expr: function (value) { return value; },
		input: function (props, fallback) { return props.input === undefined ? fallback : props.input; },
		canContinue: function () { return !java.lang.Thread.currentThread().isInterrupted(); },
		callBlock: function (name, props) {
			if (!Object.prototype.hasOwnProperty.call(blocks, name) || typeof blocks[name].run !== "function")
				throw new Error("Undeclared row transform dependency");
			return blocks[name].run(ctx, {props:props || {}});
		},
		lib: function (name) { if (!Object.prototype.hasOwnProperty.call(blocks, "$lib."+name)) throw new Error("Undeclared row library"); return blocks["$lib."+name]; },
		rowState: state
	};
	return {
		next: function (row) {
			var result = ctx.callBlock(entry, {row:row, input:input, index:count++});
			return result == null ? {skip:true} : {row:result};
		},
		batch: function (rows) { return ctx.callBlock(entry, {rows:rows, input:input}); },
		finish: function () { return finish ? ctx.callBlock(finish, {input:input, count:count}) : {}; }
	};
})
