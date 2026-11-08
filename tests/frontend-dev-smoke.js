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
var overlay=module.check(['/'],{now:function(){return 0;},probe:function(){return {status:200,html:'<vite-error-overlay>[TSCONFIG_ERROR] Failed to load tsconfig</vite-error-overlay>'};},logTail:function(){return '';}});
assert(!overlay.ok && overlay.routes[0].httpStatus===200 && overlay.routes[0].status==='failed','HTTP 200 with Vite overlay must fail');
print('frontend-dev-smoke OK');
