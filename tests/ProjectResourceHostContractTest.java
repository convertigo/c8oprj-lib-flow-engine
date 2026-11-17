// Acceptance contract for the remaining Convertigo host work. Run with Java 25 and its runtime classpath.
// Intentionally separate from the JS suite: current develop still needs the documented host changes.
import java.io.File;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipFile;
import com.twinsoft.convertigo.engine.Engine;
import com.twinsoft.convertigo.engine.flow.FlowSourceLayout;
import com.twinsoft.convertigo.engine.util.CarUtils;
import com.twinsoft.convertigo.engine.util.ZipUtils;

class ProjectResourceHostContractTest {
    public static void main(String[] args) throws Exception {
        var root = Files.createTempDirectory(Path.of(System.getProperty("java.io.tmpdir")), "resource-host-");
        var project = root.resolve("p");
        Files.createDirectories(project);
        var failures = new ArrayList<String>();
        FlowSourceLayout.current().ensureHttpIgnore(project.toFile());
        var rules = Files.readString(project.resolve(".httpignore"));
        for (var rule : List.of("/_flow/", "/tests/", "/docs/")) {
            boolean present = rules.lines().anyMatch(rule::equals);
            System.out.println((present ? "PASS " : "PENDING ") + "bootstrap " + rule);
            if (!present) failures.add("bootstrap " + rule);
        }
        Files.createDirectories(project.resolve("tests"));
        Files.writeString(project.resolve("tests/x.py"), "# test\n");
        Files.createDirectories(project.resolve("docs"));
        Files.writeString(project.resolve("docs/x.md"), "# notes\n");
        Engine.PROJECTS_PATH = root.toString();
        Engine.logEngine = org.apache.log4j.Logger.getLogger("resource-host-contract");
        var method = CarUtils.class.getDeclaredMethod("getUndeployedFiles", String.class);
        method.setAccessible(true);
        @SuppressWarnings("unchecked") var excluded = (Set<File>) method.invoke(null, "p");
        // Same exclusion set and ZIP writer as CarUtils.makeArchive, without project import or deployment.
        var archive = root.resolve("p.car");
        ZipUtils.makeZip(archive.toString(), project.toString(), "p", excluded);
        try (var zip = new ZipFile(archive.toFile())) {
            boolean testsAbsent = zip.stream().noneMatch(e -> e.getName().contains("/tests/"));
            boolean docsPresent = zip.stream().anyMatch(e -> e.getName().endsWith("/docs/x.md"));
            System.out.println((testsAbsent ? "PASS " : "PENDING ") + "tests absent from archive");
            System.out.println((docsPresent ? "PASS " : "FAIL ") + "docs retained in archive");
            if (!testsAbsent) failures.add("tests absent from archive");
            if (!docsPresent) failures.add("docs retained in archive");
        }
        System.out.println("Fixture retained for host gio trash: " + root);
        if (!failures.isEmpty()) throw new AssertionError(String.join(", ", failures));
    }
}
