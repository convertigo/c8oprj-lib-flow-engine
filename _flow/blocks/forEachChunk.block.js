const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": ["backend"],
  "icon": "mdi:view-sequential-outline",
  "tags": ["control", "loop", "chunk", "batch", "stream", "import", "export", "reduce", "pagination"],
  "description": "Pulls a source chunk by chunk with bounded memory and runs Each for every chunk: a fresh local per chunk, parent for the caller scope. With into, emit fills that result field, in stream when the requester accepts it, else as an array. Reduce combines the value each chunk returns. With parallel, chunks run at the same time and parent, result, input and config are read-only in the slots.",
  "summary": "for each chunk of {{source}}",
  "properties": {
    "source": {
      "label": "Source",
      "kind": "expression",
      "type": "any",
      "required": true,
      "description": "A row source (a cursor from a source block) or an array, cut into chunks of size."
    },
    "size": {
      "label": "Chunk size",
      "kind": "value",
      "type": "integer",
      "default": 200,
      "description": "Maximum rows per chunk, from 1 to 10000."
    },
    "into": {
      "label": "Emitted result field",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Result field filled by emit: written in stream when the requester accepts it, else set as an array. Empty: nothing is emitted."
    },
    "onError": {
      "label": "On error",
      "kind": "value",
      "type": "string",
      "default": "stop",
      "description": "stop: an error of a chunk ends the Flow; continue: it is counted in errors and the next chunk runs."
    },
    "parallel": {
      "label": "Parallel chunks",
      "kind": "value",
      "type": "integer",
      "default": 1,
      "description": "Chunks processed at the same time, from 1 to 64, on the free threads of the server (one by one otherwise). Above 1, the slots only write their local: return a value and combine it in reduce (in chunk order), or emit rows. Blocks that need the Convertigo context (session, requestable calls) are refused there."
    },
    "ordered": {
      "label": "Ordered emit",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "With parallel, emit keeps the chunk order when true, with a bounded buffer. False does not guarantee the order (this version keeps it anyway)."
    },
    "maxChunks": {
      "label": "Maximum chunks",
      "kind": "value",
      "type": "integer",
      "default": 100000,
      "description": "Safety bound, from 1 to 1000000."
    }
  },
  "slots": [
    {
      "name": "each",
      "label": "Each chunk",
      "acceptsFrom": "parentSlot",
      "inline": true,
      "scope": "iteration",
      "params": ["chunk"],
      "description": "Runs once per chunk with chunk.rows, chunk.index and chunk.last, a fresh local and parent for the caller scope (read-only with parallel). return gives the value of the chunk. Reading chunk.last pulls the next chunk ahead."
    },
    {
      "name": "reduce",
      "label": "Reduce",
      "acceptsFrom": "parentSlot",
      "inline": true,
      "scope": "iteration",
      "params": ["acc", "value"],
      "optional": true,
      "description": "Combines acc (null at first) with the value of a chunk, in chunk order; return gives the new acc, the output of the block. With parallel it should be associative."
    }
  ],
  "children": ["each", "reduce"],
  "outputs": {"out": {"type": "any"}},
  "hooks": {"file": "forEachChunk.hooks.js"}
}

(function () {
  var SLOT_SCOPES = ["local", "parent", "chunk", "acc", "value"];

  function bounded(ctx, node, props, key, fallback, minimum, maximum) {
    var raw = props[key] === undefined ? fallback : ctx.template(props[key]);
    var value = Number(raw);
    if ((typeof raw !== "number" && typeof raw !== "string") || !isFinite(value) || Math.floor(value) !== value || value < minimum || value > maximum) {
      ctx.throwFlow({code: "FOR_EACH_CHUNK_LIMIT_INVALID", message: "forEachChunk " + key + " must be an integer from " + minimum + " to " + maximum + ".", status: 400}, node);
    }
    return value;
  }

  function reader(ctx, node, source, size) {
    if (Array.isArray(source)) {
      var offset = 0;
      return {
        next: function () {
          if (offset >= source.length) return null;
          var part = source.slice(offset, offset + size);
          offset += size;
          return part;
        },
        close: function () {}
      };
    }
    if (source && source.__flowHandle === true && source.__flowHandleType === "row-cursor") {
      return {next: function () { return ctx.rowsCursorNext(source, size); }, close: function () { ctx.closeRowsCursor(source); }};
    }
    if (source === null || source === undefined) {
      return {next: function () { return null; }, close: function () {}};
    }
    ctx.throwFlow({code: "FOR_EACH_CHUNK_SOURCE_INVALID", message: "forEachChunk source must be an array or a row source.", status: 400}, node);
  }

  // Runs a slot in its own scope: a fresh local, the given variables, and a return that ends only this slot.
  function runSlot(ctx, nodes, variables) {
    var saved = {}, previousReturned = ctx.returned, previousStopped = ctx.stopped;
    SLOT_SCOPES.forEach(function (name) { saved[name] = ctx.scopes[name]; });
    ctx.scopes.local = {};
    Object.keys(variables).forEach(function (name) { ctx.scopes[name] = variables[name]; });
    ctx.returned = undefined;
    ctx.stopped = false;
    try {
      ctx.runNodes(nodes || []);
      return ctx.returned;
    } finally {
      SLOT_SCOPES.forEach(function (name) { ctx.scopes[name] = saved[name]; });
      ctx.returned = previousReturned;
      ctx.stopped = previousStopped;
    }
  }

  // Reading a chunk ahead only serves chunk.last: an Each slot that uses chunk only for its rows and index pulls the
  // next chunk once the current one is done, so that a failing source stops after the last complete chunk.
  var readsLast = typeof WeakMap === "function" ? new WeakMap() : null;
  function needsLast(nodes) {
    if (!nodes || typeof nodes !== "object") return false;
    var known = readsLast && readsLast.get(nodes);
    if (known !== undefined) return known;
    var uses = /\bchunk\b(?!\s*\.\s*(?:rows|index)\b)/.test(JSON.stringify(nodes));
    if (readsLast) readsLast.set(nodes, uses);
    return uses;
  }

  function errorOf(error) {
    var value = error && error.value !== undefined ? error.value : error;
    return {
      code: String(value && value.code || "FLOW_ERROR"),
      message: String(value && value.message || error && error.message || error)
    };
  }

  var EMIT_BUFFER_LIMIT = 100000;

  // Chunks on parallel lanes (flow-json-native/PARALLEL-DESIGN.md): this thread reads the source and settles the chunks
  // in their order (emitted rows to the sink, reduce, errors); a lane runs Each with a fresh local, parent and the other
  // scopes of the caller read-only, and keeps what it emits until its chunk is settled here.
  function runParallel(ctx, node, options) {
    var outer = ctx.scopes.local;
    var sinks = ctx.emitSinks || (ctx.emitSinks = []);
    var sink = options.into ? ctx.openEmitSink(options.into, node) : null;
    if (sink) sinks.push(sink);
    var target = sinks.length ? sinks[sinks.length - 1] : null;
    var chunks = reader(ctx, node, options.source, options.size);
    var hasReduce = !!(node.reduce && node.reduce.length);
    var lookahead = needsLast(node.each);
    var continueOnError = options.onError === "continue";
    var pulled = 0, settled = 0, rows = 0, errors = [], acc = null, next;
    try {
      if (lookahead) next = chunks.next();
      ctx.runLanes({
        lanes: options.parallel,
        parent: outer,
        failFast: !continueOnError,
        check: function () {
          if (!ctx.canContinue()) ctx.throwFlow({code: "FLOW_EXECUTION_CANCELLED", message: "Chunk processing cancelled.", status: 499}, node);
        },
        pull: function () {
          var current = lookahead ? next : chunks.next();
          if (current === null) return null;
          if (pulled >= options.maxChunks) {
            ctx.throwFlow({code: "FOR_EACH_CHUNK_LIMIT", message: "forEachChunk reached its maximum number of chunks.", status: 508, details: {maxChunks: options.maxChunks}}, node);
          }
          var task = {index: pulled++, rows: current};
          if (lookahead) {
            next = chunks.next();
            task.last = next === null;
          }
          return task;
        },
        // on a lane: what Each emits waits in the outcome of its chunk
        work: function (lane, task) {
          var emitted = [], count = 0;
          task.emitted = emitted;
          lane.emitSinks = target ? [{stream: false, append: function (value) {
            count += Array.isArray(value) ? value.length : value === undefined || value === null ? 0 : 1;
            if (count > EMIT_BUFFER_LIMIT) {
              lane.throwFlow({code: "FOR_EACH_CHUNK_EMIT_BUFFER", message: "A parallel chunk emits at most " + EMIT_BUFFER_LIMIT + " rows.", status: 507}, node);
            }
            emitted.push(value);
          }, close: function () {}}] : [];
          var chunk = {rows: task.rows, index: task.index};
          if (lookahead) chunk.last = task.last;
          return runSlot(lane, node.each, {parent: outer, chunk: chunk});
        },
        // on this thread, in chunk order: the emitted rows, then the error or the reduce
        settle: function (outcome, lane) {
          var task = outcome.task;
          var emitted = task.emitted || [];
          for (var i = 0; i < emitted.length; i++) target.append(emitted[i]);
          task.emitted = null;
          rows += task.rows.length;
          settled++;
          if (outcome.failed) {
            if (!continueOnError) throw outcome.error;
            if (errors.length < 100) errors.push(Object.assign({index: task.index}, errorOf(outcome.error)));
            return;
          }
          if (hasReduce && outcome.value !== undefined) {
            lane.emitSinks = target ? [target] : [];
            acc = runSlot(lane, node.reduce, {parent: outer, acc: acc, value: outcome.value});
          }
        }
      });
    } finally {
      chunks.close();
      if (sink) sinks.pop();
    }
    if (sink) sink.close();
    return hasReduce ? acc : {chunks: settled, rows: rows, errors: errors};
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node);
      var size = bounded(ctx, node, props, "size", 200, 1, 10000);
      var maxChunks = bounded(ctx, node, props, "maxChunks", 100000, 1, 1000000);
      var parallel = bounded(ctx, node, props, "parallel", 1, 1, 64);
      var onError = props.onError === undefined ? "stop" : String(ctx.template(props.onError));
      if (onError !== "stop" && onError !== "continue") {
        ctx.throwFlow({code: "FOR_EACH_CHUNK_ON_ERROR_INVALID", message: "forEachChunk onError takes stop or continue.", status: 400}, node);
      }
      var into = props.into === undefined ? "" : String(ctx.template(props.into) || "");
      var ordered = props.ordered === undefined ? false : ctx.template(props.ordered);
      if (ordered !== true && ordered !== false) {
        ctx.throwFlow({code: "FOR_EACH_CHUNK_ORDERED_INVALID", message: "forEachChunk ordered takes true or false.", status: 400}, node);
      }
      var source = ctx.expr(props.source);
      if (parallel > 1) return runParallel(ctx, node, {source: source, size: size, maxChunks: maxChunks, onError: onError, into: into, parallel: parallel});
      var outer = ctx.scopes.local;
      var sink = into ? ctx.openEmitSink(into, node) : null;
      var sinks = ctx.emitSinks || (ctx.emitSinks = []);
      if (sink) sinks.push(sink);
      var chunks = reader(ctx, node, source, size);
      var hasReduce = !!(node.reduce && node.reduce.length);
      var lookahead = needsLast(node.each);
      var index = 0, rows = 0, errors = [], acc = null;
      try {
        var next = chunks.next();
        while (next !== null) {
          if (!ctx.canContinue()) ctx.throwFlow({code: "FLOW_EXECUTION_CANCELLED", message: "Chunk processing cancelled.", status: 499}, node);
          if (index >= maxChunks) {
            ctx.throwFlow({code: "FOR_EACH_CHUNK_LIMIT", message: "forEachChunk reached its maximum number of chunks.", status: 508, details: {maxChunks: maxChunks}}, node);
          }
          var current = next;
          var chunk = {rows: current, index: index};
          if (lookahead) {
            next = chunks.next();
            chunk.last = next === null;
          }
          var value;
          try {
            value = runSlot(ctx, node.each, {parent: outer, chunk: chunk});
          } catch (error) {
            if (onError !== "continue") throw error;
            if (errors.length < 100) errors.push(Object.assign({index: index}, errorOf(error)));
            value = undefined;
          }
          rows += current.length;
          index++;
          current = chunk = null;
          if (hasReduce && value !== undefined) {
            acc = runSlot(ctx, node.reduce, {parent: outer, acc: acc, value: value});
          }
          if (!lookahead) next = chunks.next();
        }
      } finally {
        chunks.close();
        if (sink) sinks.pop();
      }
      if (sink) sink.close();
      return hasReduce ? acc : {chunks: index, rows: rows, errors: errors};
    }
  };
}())
