const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": ["backend"],
  "icon": "mdi:repeat",
  "tags": ["control", "loop", "while", "iterate", "pagination"],
  "description": "Runs child nodes while the condition is true, without waiting between iterations. Checks cancellation and its time budget every turn. Bound child I/O separately: a cooperative loop cannot interrupt a child call.",
  "summary": "while {{condition}}",
  "properties": {
    "condition": {
      "label": "Condition",
      "kind": "expression",
      "type": "boolean",
      "required": true,
      "default": "true",
      "description": "Evaluated before every iteration, including the first. False completes the loop."
    },
    "maxIterations": {
      "label": "Maximum iterations",
      "kind": "value",
      "type": "integer",
      "required": true,
      "default": 1000,
      "description": "Required safety bound, from 1 to 1000000. Reaching the bound is an error if the condition remains true."
    },
    "timeoutMs": {
      "label": "Timeout (ms)",
      "kind": "value",
      "type": "integer",
      "default": 60000,
      "description": "Loop time budget, from 1 to 600000 ms; the enclosing request's cancellation also applies."
    }
  },
  "slots": [{
    "name": "nodes",
    "label": "Body",
    "acceptsFrom": "parentSlot",
    "inline": true,
    "scope": "caller",
    "description": "Runs in the caller scope; update locals read by the condition."
  }],
  "children": ["nodes"],
  "outputs": {"out": {"type": "object", "properties": {
    "iterations": {"type": "integer"},
    "completed": {"type": "boolean"}
  }}},
  "hooks": {"file": "while.hooks.js"}
}

(function () {
  // the clock, from the engine (flowEngineClass, kept for the runtime), not looked up through the Packages of each call
  var System = typeof flowEngineClass === "function" ? flowEngineClass("java.lang.System") : Packages["java.lang.System"];
  function bounded(ctx,node,props,key,fallback,maximum) {
    var raw=props[key]===undefined ? fallback : ctx.template(props[key]);
    var value=Number(raw);
    if ((typeof raw!=="number" && typeof raw!=="string") || !isFinite(value) || Math.floor(value)!==value || value<1 || value>maximum)
      ctx.throwFlow({code:"WHILE_LIMIT_INVALID",message:"while "+key+" must be an integer from 1 to "+maximum+".",status:400},node);
    return value;
  }
  function capture(ctx,node,condition) {
    var props=ctx.props(node);
    var args={maxIterations:bounded(ctx,node,props,"maxIterations",1000,1000000),timeoutMs:bounded(ctx,node,props,"timeoutMs",60000,600000)};
    args.condition=!!condition(ctx);args.iteration=0;return args;
  }
  function executeCaptured(ctx,node,args,condition) {
    var first=true;
    return execute(ctx,node,function(ctx){
      if(first){first=false;return args.condition;}
      args.iteration++;args.condition=!!condition(ctx);return args.condition;
    },args);
  }
  function execute(ctx, node, condition, captured) {
    var props = ctx.props(node);
    var limit = captured ? captured.maxIterations : bounded(ctx, node, props, "maxIterations", 1000, 1000000);
    var timeout = captured ? captured.timeoutMs : bounded(ctx, node, props, "timeoutMs", 60000, 600000);
    var started = System.nanoTime(), iterations = 0;
    for (;;) {
      if (!ctx.canContinue()) ctx.throwFlow({code: "FLOW_EXECUTION_CANCELLED", message: "Loop execution cancelled.", status: 499}, node);
      if ((System.nanoTime() - started) / 1000000 >= timeout) {
        ctx.throwFlow({code: "WHILE_TIMEOUT", message: "The while loop exceeded its time budget.", status: 504,
          details: {iterations: iterations, timeoutMs: timeout}}, node);
      }
      if (ctx.stopped) return {iterations: iterations, completed: false};
      if (!condition(ctx)) return {iterations: iterations, completed: true};
      if (iterations >= limit) {
        ctx.throwFlow({code: "WHILE_ITERATION_LIMIT", message: "The while condition is still true after the maximum number of iterations.", status: 508,
          details: {iterations: iterations, maxIterations: limit}}, node);
      }
      ctx.runLoopBody(node.nodes || []);
      iterations++;
    }
  }
  return {
    stateless: true,
    prepareNode: function (node, helpers) {
      var condition = helpers.compileExpression(helpers.props.condition);
      var runner=function (ctx, runNode) { return execute(ctx, runNode, condition); };
      return helpers.debug ? helpers.debug(runner,
        function(ctx){return capture(ctx,node,condition);},
        function(ctx,runNode,args){return executeCaptured(ctx,runNode,args,condition);}) : runner;
    },
    run: function (ctx, node) {
      var props = ctx.props(node);
      return execute(ctx, node, function () { return !!ctx.expr(props.condition); });
    }
  };
}())
