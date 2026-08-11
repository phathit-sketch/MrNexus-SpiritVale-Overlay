import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const APP_VERSION = "1.0.0";
const RELEASE_NAME = `SpiritValeDropsOverlay-v${APP_VERSION}-win64`;
const cwd = process.cwd();

function run(cmd: string[], label: string, runCwd = cwd): void {
  console.log(`\n== ${label} ==`);
  console.log(`> ${cmd.join(" ")}`);

  const r = Bun.spawnSync({
    cmd,
    cwd: runCwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (r.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${r.exitCode}`);
  }
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];

  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      out.push(p);
      if (e.isDirectory()) stack.push(p);
    }
  }
  return out;
}

function findInstallerArchive(): string {
  const stableRoot = join(cwd, "dist", "electrobun", "stable-win-x64");

  const archives = walk(stableRoot)
    .filter((p) => p.toLowerCase().endsWith("-setup.tar.zst"))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (!archives.length) {
    throw new Error(
      "No *-Setup.tar.zst found under dist/electrobun/stable-win-x64."
    );
  }

  return archives[0];
}

function extractTarZst(archive: string, destination: string): void {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  const direct = Bun.spawnSync({
    cmd: ["tar.exe", "-xf", archive, "-C", destination],
    cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (direct.exitCode === 0) return;

  const sevenZipCandidates = [
    "7z.exe",
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ];

  for (const sevenZip of sevenZipCandidates) {
    const probe = Bun.spawnSync({
      cmd: [sevenZip, "i"],
      stdout: "ignore",
      stderr: "ignore",
    });
    if (probe.exitCode !== 0) continue;

    run([sevenZip, "x", archive, `-o${destination}`, "-y"], "Decompress .zst");

    const tarFile = walk(destination).find((p) =>
      p.toLowerCase().endsWith(".tar")
    );
    if (!tarFile) continue;

    run([sevenZip, "x", tarFile, `-o${destination}`, "-y"], "Extract .tar");
    rmSync(tarFile, { force: true });
    return;
  }

  throw new Error(
    "Could not extract Setup.tar.zst. Install 7-Zip or use a Windows tar.exe with zstd support."
  );
}

function scoreAppRoot(dir: string): number {
  let score = 0;
  if (existsSync(join(dir, "bin"))) score += 30;
  if (existsSync(join(dir, "Resources"))) score += 30;
  if (existsSync(join(dir, "Resources", "app"))) score += 40;
  return score;
}

function findExtractedAppRoot(extractedRoot: string): string {
  const dirs = [
    extractedRoot,
    ...walk(extractedRoot).filter((p) => {
      try { return statSync(p).isDirectory(); } catch { return false; }
    }),
  ];

  const candidates = dirs
    .map((p) => ({ p, score: scoreAppRoot(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    throw new Error("Could not identify the extracted Electrobun app root.");
  }

  return candidates[0].p;
}

function findElectrobunLauncher(appRoot: string): string {
  const exact = join(appRoot, "bin", "launcher.exe");
  if (existsSync(exact)) return exact;

  const candidates = walk(join(appRoot, "bin"))
    .filter((p) => {
      try {
        return statSync(p).isFile() &&
          p.toLowerCase().endsWith(".exe") &&
          basename(p).toLowerCase() !== "bun.exe" &&
          !basename(p).toLowerCase().includes("setup") &&
          !basename(p).toLowerCase().includes("uninstall");
      } catch {
        return false;
      }
    });

  const launcher = candidates.find((p) =>
    basename(p).toLowerCase().includes("launcher")
  );

  if (!launcher) {
    throw new Error("Electrobun launcher.exe was not found.");
  }

  return launcher;
}

// ------------------------------------------------------------------
// 1) Electrobun production build
// ------------------------------------------------------------------
run(["bun", "run", "build:stable"], "Electrobun stable build");

const archive = findInstallerArchive();
console.log(`\nInstaller payload: ${relative(cwd, archive)}`);

// ------------------------------------------------------------------
// 2) Extract the payload Setup.exe would normally install
// ------------------------------------------------------------------
const releaseRoot = join(cwd, "dist", "portable");
const extractRoot = join(releaseRoot, "__extract");

extractTarZst(archive, extractRoot);

const appRoot = findExtractedAppRoot(extractRoot);
const launcher = findElectrobunLauncher(appRoot);

console.log(`Extracted app root: ${relative(cwd, appRoot)}`);
console.log(`Electrobun launcher: ${relative(appRoot, launcher)}`);

// ------------------------------------------------------------------
// 3) Build a DIRECT portable folder.
//
// IMPORTANT:
// Electrobun resolves Resources relative to app/bin/launcher.exe.
// Therefore we deliberately KEEP:
//   bin/
//   Resources/
//
// We do not move launcher.exe to the portable root because that would make
// Electrobun look for ../Resources in the wrong place.
// ------------------------------------------------------------------
const portableDir = join(releaseRoot, RELEASE_NAME);
const zipPath = join(releaseRoot, `${RELEASE_NAME}.zip`);

rmSync(portableDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(portableDir, { recursive: true });

cpSync(appRoot, portableDir, { recursive: true });

// Give the REAL Electrobun launcher a friendly name, but keep it inside bin/.
const oldLauncher = join(portableDir, relative(appRoot, launcher));
const friendlyLauncher = join(dirname(oldLauncher), "SpiritValeDropsOverlay.exe");

if (oldLauncher.toLowerCase() !== friendlyLauncher.toLowerCase()) {
  rmSync(friendlyLauncher, { force: true });
  renameSync(oldLauncher, friendlyLauncher);
}

// Existing project sounds are copied beside bin/ + Resources/.
// runtime-config detects the portable root from this layout.
const projectSounds = join(cwd, "sounds");
if (existsSync(projectSounds)) {
  cpSync(projectSounds, join(portableDir, "sounds"), { recursive: true });
}
mkdirSync(join(portableDir, "sounds", "packs"), { recursive: true });
mkdirSync(join(portableDir, "data"), { recursive: true });

// Marker used by runtime-config to recognize the portable root even when
// bin/SpiritValeDropsOverlay.exe is launched directly.
writeFileSync(
  join(portableDir, "portable-app.json"),
  JSON.stringify({
    directElectrobun: true,
    executable: "bin/SpiritValeDropsOverlay.exe",
  }, null, 2),
  "utf8",
);

writeFileSync(
  join(portableDir, "README-PORTABLE.txt"),
`SpiritVale Drops Overlay v${APP_VERSION}

PORTABLE BUILD — NO INSTALLER, NO WRAPPER

HOW TO START
1. Extract the entire ZIP.
2. Open the "bin" folder.
3. Double-click SpiritValeDropsOverlay.exe.
4. Ctrl + Alt + O = Hide / Show Overlay.

IMPORTANT
Do not move SpiritValeDropsOverlay.exe out of the bin folder.
Electrobun needs this layout:

  bin/
  Resources/

Portable settings:
  data/settings.json

Sound packs:
  sounds/packs/<PackName>/

Uninstall:
  Close the overlay and delete this folder.
`,
  "utf8",
);

rmSync(extractRoot, { recursive: true, force: true });

// ------------------------------------------------------------------
// 4) ZIP for GitHub Release
// ------------------------------------------------------------------
run(
  [
    "powershell.exe",
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Compress-Archive -Path '${portableDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`,
  ],
  "ZIP portable release"
);

console.log("\n============================================");
console.log("DIRECT PORTABLE RELEASE READY");
console.log(`Folder: ${portableDir}`);
console.log(`ZIP:    ${zipPath}`);
console.log(`Run:    ${join(portableDir, "bin", "SpiritValeDropsOverlay.exe")}`);
console.log("============================================\n");