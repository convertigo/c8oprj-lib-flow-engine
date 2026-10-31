// Characterize the actual Java naming boundary without starting a server or changing Java.
var E=Packages.com.twinsoft.convertigo.engine.Engine, M=Packages.com.twinsoft.convertigo.engine.ContextManager;
var P=Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
P.initProperties();P.setProperty(P.PropertyName.SERVER_BUILD,'studio');
var previous=E.theApp;
try {
 E.logEngine=Packages.org.apache.log4j.Logger.getLogger('offline');E.logContext=E.logEngine;E.logContextManager=E.logEngine;E.logUsageMonitor=E.logEngine;
 E.setStudioMode();E.theApp=new E();var manager=new M(),name=String(manager.computeStudioContextName('S','IsolationFixture','_identity'));
 var context=new Packages.com.twinsoft.convertigo.engine.Context(name),map=new java.util.HashMap();map.put(name,context);
 var field=java.lang.Class.forName('com.twinsoft.convertigo.engine.ContextManager').getDeclaredField('contexts');field.setAccessible(true);field.set(manager,map);
 var a=manager.get(null,'flow-A','session-A',null,'IsolationFixture',null,'_identity');
 var b=manager.get(null,'flow-B','session-B',null,'IsolationFixture',null,'_identity');
 print('Studio='+E.isStudioMode()+' seed='+name+' A='+a.contextID+' B='+b.contextID);
 if(!a.equals(b) || String(a.contextID)!==name)throw Error('Recheck Java Studio behavior: the naming boundary changed');
 print('requestable-studio-context-boundary: Java reuses '+name+' across two sessions; global session isolation is NOT certified by the library test');
} finally {E.theApp=previous;}
