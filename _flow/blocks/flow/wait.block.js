const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Waits without a busy loop, checking cancellation. One delay is bounded to 60 seconds; use flow.poll for a bounded asynchronous-job retry.",
  "icon": "mdi:puzzle-outline",
  "private": false,
  "properties": {
    "delayMs": {
      "type": "integer",
      "kind": "value",
      "description": "Delay in milliseconds, from 0 to 60000.",
      "default": 1000,
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "waitedMs": {
          "type": "integer",
        },
      },
    },
  },
  "runtime": "rhino",
  "targets": [
    "backend",
  ],
  "summary": "wait {{delayMs}} ms",
  "tags": [
    "control",
    "wait",
    "sleep",
    "delay",
    "polling",
  ],
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () { return {stateless:true,run:function(ctx,node) {
 var delay=Number(ctx.template(ctx.props(node).delayMs)),System=Packages.java.lang.System,Thread=Packages.java.lang.Thread;
 if(!isFinite(delay)||Math.floor(delay)!==delay||delay<0||delay>60000)ctx.raise('WAIT_DELAY_INVALID','flow.wait delayMs must be an integer from 0 to 60000.');
 var start=System.nanoTime(),deadline=start+delay*1000000;
 while(System.nanoTime()<deadline){
  if(!ctx.canContinue())ctx.raise('FLOW_EXECUTION_CANCELLED','Wait cancelled.');
  var left=Math.ceil((deadline-System.nanoTime())/1000000);
  if(left>0)try{Thread.sleep(Math.min(100,left));}catch(e){Thread.currentThread().interrupt();ctx.raise('FLOW_EXECUTION_CANCELLED','Wait interrupted.');}
 }
 if(!ctx.canContinue())ctx.raise('FLOW_EXECUTION_CANCELLED','Wait cancelled.');
 return {waitedMs:Math.floor((System.nanoTime()-start)/1000000)};
}}; }())
