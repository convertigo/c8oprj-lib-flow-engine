const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": [
    "backend"
  ],
  "description": "Runs its child nodes, tests until, then waits before retrying. Stops on success, cancellation, child failure, timeout or attempt limit; never busy-polls. Bounds cannot interrupt an in-flight child I/O; bound that call too.",
  "properties": {
    "until": {
      "type": "boolean",
      "kind": "expression",
      "description": "Expression evaluated after each attempt; true completes polling."
    },
    "intervalMs": {
      "type": "integer",
      "kind": "value",
      "description": "Delay between attempts, 10..10000 ms.",
      "default": 1000
    },
    "timeoutMs": {
      "type": "integer",
      "kind": "value",
      "description": "Overall budget, 1..600000 ms, checked before/after every attempt. Bound child HTTP timeouts too.",
      "default": 30000
    },
    "maxAttempts": {
      "type": "integer",
      "kind": "value",
      "description": "Maximum attempts, 1..10000.",
      "default": 30
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "attempts": {
          "type": "integer"
        },
        "elapsedMs": {
          "type": "integer"
        },
        "completed": {
          "type": "boolean"
        }
      }
    }
  },
  "summary": "poll until {{until}}",
  "tags": [
    "control",
    "poll",
    "wait",
    "retry",
    "job",
    "loop"
  ],
  "children": [
    "nodes"
  ],
  "slots": [
    {
      "name": "nodes",
      "label": "Attempt",
      "acceptsFrom": "parentSlot",
      "scope": "caller",
      "inline": true,
      "description": "One attempt; update caller locals used by until."
    }
  ]
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () {return {run:function(ctx,node){
 var p=ctx.props(node),System=Packages.java.lang.System;
 function bounded(key,min,max){var v=Number(ctx.template(p[key]));if(!isFinite(v)||Math.floor(v)!==v||v<min||v>max)ctx.raise('POLL_LIMIT_INVALID','flow.poll '+key+' must be an integer from '+min+' to '+max+'.');return v;}
 var interval=bounded('intervalMs',10,10000),timeout=bounded('timeoutMs',1,600000),limit=bounded('maxAttempts',1,10000),start=System.nanoTime();
 function elapsed(){return (System.nanoTime()-start)/1000000;}
 function timedOut(attempt){ctx.throwFlow({code:'POLL_TIMEOUT',message:'Polling did not complete within its timeout or attempt limit.',status:504,details:{attempts:attempt,elapsedMs:Math.floor(elapsed()),timeoutMs:timeout,maxAttempts:limit}},node);}
 for(var attempt=1;attempt<=limit;attempt++){
  if(!ctx.canContinue())ctx.raise('FLOW_EXECUTION_CANCELLED','Polling cancelled.');
  if(elapsed()>=timeout)timedOut(attempt-1);
  ctx.runNodes(node.nodes||[]);
  if(ctx.stopped)return {attempts:attempt,elapsedMs:Math.floor(elapsed()),completed:false};
  if(!ctx.canContinue())ctx.raise('FLOW_EXECUTION_CANCELLED','Polling cancelled.');
  if(elapsed()>=timeout)timedOut(attempt);
  if(ctx.expr(p.until))return {attempts:attempt,elapsedMs:Math.floor(elapsed()),completed:true};
  if(attempt===limit)timedOut(attempt);
  ctx.callBlock('flow.wait',{delayMs:Math.min(interval,Math.max(0,Math.ceil(timeout-elapsed())))},{trace:false});
 }
}};}())
