var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var module=eval(String(IO.readFileToString(new File(arguments[0],'modules/frontend-dev-smoke.js'),'UTF-8')));
var seen=[],clock=0;
function assert(v,m){if(!v)throw Error(m);}
var result=module.check(['/','/orders/','/draft/','/orders/[id]/'],{now:function(){return clock;},probe:function(route){seen.push(route);return route==='/draft/'?500:200;},logTail:function(){return 'TypeError: null at +page.flow.svelte:12 property test';}});
assert(!result.ok && !result.complete && !result.runtimeVerified,'failed route cannot be an app validation');
assert(result.routes[2].route==='/draft/' && result.routes[2].httpStatus===500,'route and HTTP status');
assert(result.logTail.indexOf('property test')>=0,'dev log diagnostic returned');
assert(seen.length===3 && result.routes[3].status==='not_checked','dynamic routes are explicitly unverified');
var over=module.check(['/','/second'],{now:function(){return clock;},probe:function(){clock+=16000;return 200;},logTail:function(){return '';}});
assert(!over.complete && over.routes[1].status==='not_checked','total budget bounded');
['<vite-error-overlay></vite-error-overlay>','[TSCONFIG_ERROR] Failed to load tsconfig'].forEach(function(html){
	var overlay=module.check(['/'],{now:function(){return 0;},probe:function(){return {status:200,html:html};},logTail:function(){return '';}});
	assert(!overlay.ok && overlay.routes[0].httpStatus===200 && overlay.routes[0].status==='failed','HTTP 200 with Vite overlay must fail');
});
// The module of the root layout: a page served 200 (its HTML shell) does not prove that Vite transforms its modules
var vitePage='<script type="module">\nconst error = '+JSON.stringify({message:"Transform failed with 1 error:\n\n[TSCONFIG_ERROR] Failed to load tsconfig '$app/tsconfig': Tsconfig not found"})+'\n</script>';
var broken=module.check(['/'],{now:function(){return 0;},probe:function(path){return path==='/'?{status:200,html:'<div id="svelte"></div>'}:{status:500,html:vitePage};},logTail:function(){return 'vite log';}},['src/routes/+layout.ts']);
assert(!broken.ok && broken.routes[0].status==='passed' && broken.modules[0].module==='src/routes/+layout.ts' && broken.modules[0].httpStatus===500,'a module Vite fails to transform fails the smoke check: '+JSON.stringify(broken));
assert(broken.modules[0].message==="Transform failed with 1 error: [TSCONFIG_ERROR] Failed to load tsconfig '$app/tsconfig': Tsconfig not found" && broken.logTail==='vite log','with the message of Vite: '+JSON.stringify(broken.modules));
// settleMs: a module may fail while Vite notices a change just made, then pass
var now=0,tries=0,settled=module.check(['/'],{now:function(){return now;},sleep:function(ms){now+=ms;},settleMs:2000,probe:function(path){return path==='/'?200:(++tries<3?500:200);},logTail:function(){return '';}},['src/routes/+layout.ts']);
assert(settled.ok && tries===3 && settled.modules[0].status==='passed','a module that passes within settleMs passes: '+JSON.stringify(settled));
now=0;tries=0;
var once=module.check([],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(){tries++;return 500;},logTail:function(){return '';}},['src/routes/+layout.ts']);
assert(!once.ok && tries===1,'without settleMs a module is requested once');
now=0;tries=0;
var bounded=module.check([],{now:function(){return now;},sleep:function(ms){now+=ms;},settleMs:2000,probe:function(){tries++;return 500;},logTail:function(){return '';}},['src/routes/+layout.ts']);
assert(!bounded.ok && tries===21 && now===2000,'settleMs bounds the retries: '+tries+' requests, '+now+' ms');
// A dev server that does not answer (Vite restarting after a regenerated vite.config.ts) is waited for, never reported
// as a module it failed to transform (runs i80l17f_haiku, i80l17f_ml4)
now=0;tries=0;
var restarting=module.check(['/'],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(path){if(path!=='/'&&++tries<4)throw Error('Connection refused');return 200;},logTail:function(){return '';}},['src/routes/+layout.ts']);
assert(restarting.ok && tries===4 && restarting.modules[0].status==='passed','a module the restarting dev server answers later passes, without settleMs: '+JSON.stringify(restarting));
now=0;tries=0;
var down=module.check([],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(){tries++;throw Error('Connection refused');},logTail:function(){return '';}},['src/routes/+layout.ts']);
assert(!down.ok && down.modules[0].status==='unreachable' && now>=8000 && now<=8250,'a dev server that never answers is unreachable after 8 s, not a failed transform: '+JSON.stringify(down)+' '+now);
// A new route SvelteKit has not added yet answers 404 (cligate 26/11, /deals/ one second after its sync): it is requested
// again until it is served, for up to 8 s; a route still 404 after that, or answered 404 without sleep, fails.
now=0;tries=0;
var fresh=module.check(['/','/deals/'],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(path){return path==='/deals/'&&++tries<3?404:200;},logTail:function(){return '';}});
assert(fresh.ok && tries===3 && fresh.routes[1].status==='passed' && fresh.routes[1].servedAfterMs===300 && fresh.routes[0].servedAfterMs===undefined,'a new route served within 8 s passes: '+JSON.stringify(fresh));
now=0;tries=0;
var missing=module.check(['/gone/'],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(){tries++;return 404;},logTail:function(){return 'log';}});
assert(!missing.ok && missing.routes[0].httpStatus===404 && missing.routes[0].waitedMs>=8000 && missing.routes[0].waitedMs<8150 && missing.logTail==='log','a route still 404 after 8 s fails: '+JSON.stringify(missing));
now=0;tries=0;
var once404=module.check(['/gone/'],{now:function(){return now;},probe:function(){tries++;return 404;},logTail:function(){return '';}});
assert(!once404.ok && tries===1,'without sleep a route is requested once');
now=0;tries=0;
var broken500=module.check(['/draft/'],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(){tries++;return 500;},logTail:function(){return '';}});
assert(!broken500.ok && tries===1 && now===0,'a page error (500) is not waited for');
now=0;tries=0;
var refused=module.check(['/'],{now:function(){return now;},sleep:function(ms){now+=ms;},probe:function(){if(++tries<3)throw Error('Connection refused');return 200;},logTail:function(){return '';}});
assert(refused.ok && tries===3,'a route without answer (Vite restarting) is requested again');
assert(result.modules===undefined,'without modules the result keeps its shape');
print('frontend-dev-smoke OK');
