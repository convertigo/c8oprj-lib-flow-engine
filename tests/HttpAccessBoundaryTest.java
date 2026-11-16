import com.convertigo.libflowengine.HttpAccess;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.zip.*;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.entity.ByteArrayEntity;
import com.sun.net.httpserver.HttpServer;

class HttpAccessBoundaryTest {
    interface Checked { void run() throws Exception; }
    static void check(boolean value) { if (!value) throw new AssertionError(); }
    static void refuses(Checked run) throws Exception {
        try { run.run(); } catch (IOException expected) { return; }
        throw new AssertionError("Expected refusal");
    }
    public static void main(String[] args) throws Exception {
        System.clearProperty("convertigo.flow.http.allowedHosts");
        for (String ip : new String[]{"0.0.0.0","127.0.0.1","10.1.1.1","172.16.1.1","192.168.1.1","169.254.169.254","100.64.1.1","::","::1","fe80::1","fc00::1","ff02::1","::ffff:127.0.0.1"})
            check(!HttpAccess.publicAddress(InetAddress.getByName(ip)));
        for (String ip : new String[]{"1.1.1.1","8.8.8.8","2606:4700:4700::1111"}) check(HttpAccess.publicAddress(InetAddress.getByName(ip)));
        for (String uri : new String[]{"file:///etc/passwd","ftp://example.org/","http://user@example.org/","http://[fe80::1%25lo]/"}) refuses(()->HttpAccess.checkUri(URI.create(uri)));
        var budget = new HttpAccess.Budget(1000, 32);
        refuses(()->budget.destination(URI.create("http://127.0.0.1/")));
        refuses(()->HttpAccess.checkAddresses("mixed.example",new InetAddress[]{InetAddress.getByName("8.8.8.8"),InetAddress.getByName("10.0.0.1")}));
        refuses(()->new HttpAccess.Budget(1000,8).read(new ByteArrayEntity("123456789".getBytes(StandardCharsets.UTF_8))));
        var drained = new java.util.concurrent.atomic.AtomicInteger();
        var entity = new org.apache.http.entity.BasicHttpEntity();
        entity.setContent(new ByteArrayInputStream(new byte[1024]) {
            @Override public synchronized int read(byte[] bytes, int offset, int length) { int n=super.read(bytes,offset,length); if(n>0)drained.addAndGet(n); return n; }
            @Override public void close() throws IOException { while(read()!=-1)drained.incrementAndGet(); }
        });
        refuses(()->new HttpAccess.Budget(1000,8).read(entity));
        check(drained.get()==9); // A close that drains the entity must never run on the limited read path.
        check(new HttpAccess.Budget(1000,8).read(new ByteArrayEntity("12345678".getBytes(StandardCharsets.UTF_8))).equals("12345678"));
        var shared = new HttpAccess.Budget(1000,8); shared.read(new ByteArrayEntity(new byte[5])); refuses(()->shared.read(new ByteArrayEntity(new byte[4])));
        System.setProperty("convertigo.flow.http.allowedHosts","127.0.0.1,LOCALHOST.");
        check(HttpAccess.allowedHost("localhost")); check(!HttpAccess.allowedHost("localhost.attacker.org"));
        new HttpAccess.Budget(1000,8).destination(URI.create("http://127.0.0.1/"));
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var workers=Executors.newCachedThreadPool(task->{var t=new Thread(task);t.setDaemon(true);return t;});server.setExecutor(workers);
        server.createContext("/gzip", e->{
            var bytes=new ByteArrayOutputStream();try(var zipped=new GZIPOutputStream(bytes)){zipped.write(new byte[4096]);}
            e.getResponseHeaders().add("Content-Encoding","gzip");e.sendResponseHeaders(200,bytes.size());e.getResponseBody().write(bytes.toByteArray());e.close();
        });
        server.createContext("/slow", e->{
            e.sendResponseHeaders(200,0);
            try(var out=e.getResponseBody()){for(int i=0;i<100;i++){out.write(1);out.flush();Thread.sleep(15);}}
            catch(Exception stopped){}finally{e.close();}
        });
        server.start();
        try {
            var limit=new HttpAccess.Budget(3000,128);
            try(var client=HttpAccess.client(limit)){var req=new HttpGet("http://127.0.0.1:"+server.getAddress().getPort()+"/gzip");var watch=limit.watch(req);
                try(var response=client.execute(req)){refuses(()->limit.read(response.getEntity()));}finally{watch.cancel(false);}}
            long start=System.nanoTime();var deadline=new HttpAccess.Budget(180,4096);
            try(var client=HttpAccess.client(deadline)){var req=new HttpGet("http://127.0.0.1:"+server.getAddress().getPort()+"/slow");var watch=deadline.watch(req);
                try{refuses(()->{try(var response=client.execute(req)){deadline.read(response.getEntity());}});}finally{watch.cancel(false);}}
            check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<1200);
        } finally {server.stop(0);workers.shutdownNow();System.clearProperty("convertigo.flow.http.allowedHosts");}
        System.out.println("HttpAccessBoundaryTest OK (addresses, DNS sets, exceptions, decompression, shared bytes, active deadline)");
    }
}
