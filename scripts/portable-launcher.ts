import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Manifest = { executable: string };

function fail(message: string): never {
  try {
    Bun.spawn({
      cmd: ["cmd.exe", "/c", "start", "", "cmd.exe", "/k", `echo ${message.replace(/[&|<>^]/g, "")}`],
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    });
  } catch {}
  throw new Error(message);
}

const root = dirname(process.execPath);
const manifestPath = join(root, "portable-app.json");

if (!existsSync(manifestPath)) {
  fail("portable-app.json is missing. Please extract the complete ZIP again.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const exe = resolve(root, manifest.executable);

if (!existsSync(exe)) {
  fail(`Internal app executable is missing: ${manifest.executable}`);
}

const logPath = join(root, "portable-launcher.log");

function log(message: string): void {
  try {
    appendFileSync(
      logPath,
      `[${new Date().toISOString()}] ${message}\r\n`,
      "utf8",
    );
  } catch {}
}

log(`root=${root}`);
log(`exe=${exe}`);
log(`cwd=${dirname(exe)}`);

const child = Bun.spawn({
  cmd: [exe],
  // Electrobun launcher expects its own bin directory as working directory.
  cwd: dirname(exe),
  env: {
    ...process.env,
    SPIRITVALE_PORTABLE_DIR: root,
  },

  // launcher.exe is a console-subsystem executable. Our root wrapper is GUI,
  // so without this Windows may create a visible Windows Terminal/console
  // for the child even though the wrapper itself uses --windows-hide-console.
  windowsHide: true,

  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
});

log(`spawned pid=${child.pid}`);

// Keep the compiled wrapper alive for as long as Electrobun is alive.
// Do not unref + exit immediately on Windows.
const exitCode = await child.exited;
log(`child exited code=${exitCode}`);
process.exit(exitCode ?? 0);