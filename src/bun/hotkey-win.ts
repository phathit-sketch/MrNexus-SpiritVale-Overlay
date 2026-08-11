import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../core/logger.ts";

export type GlobalHotkeyHandle = {
  hotkey: string | null;
  ready: Promise<string | null>;
  stop: () => void;
};

type HotkeyCandidate = {
  label: string;
  mods: number;
  vk: number;
};

// Try the preferred combo first, then safe fallbacks.
// MOD_CONTROL=0x0002, MOD_SHIFT=0x0004, MOD_ALT=0x0001, MOD_NOREPEAT=0x4000
const CANDIDATES: HotkeyCandidate[] = [
  { label: "Ctrl+Alt+O", mods: 0x0002 | 0x0001 | 0x4000, vk: 0x4F },

];

function psArray(): string {
  return CANDIDATES.map((x, i) =>
    `@{ Id=${i + 1}; Label="${x.label}"; Mods=${x.mods}; Vk=${x.vk} }`
  ).join(",\n  ");
}

const PS_SCRIPT = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class SVOverlayHotKey {
    [StructLayout(LayoutKind.Sequential)]
    public struct MSG {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
        public uint lPrivate;
    }

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    public static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint min, uint max);
}
"@

$candidates = @(
  __CANDIDATES__
)

$selected = $null

foreach ($c in $candidates) {
    if ([SVOverlayHotKey]::RegisterHotKey([IntPtr]::Zero, [int]$c.Id, [uint32]$c.Mods, [uint32]$c.Vk)) {
        $selected = $c
        break
    }
}

if ($null -eq $selected) {
    Write-Output "FAILED"
    [Console]::Out.Flush()
    exit 2
}

Write-Output ("READY|" + $selected.Label + "|" + $selected.Id)
[Console]::Out.Flush()

try {
    $msg = [SVOverlayHotKey+MSG]::new()
    while ([SVOverlayHotKey]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0) -gt 0) {
        if ($msg.message -eq 0x0312 -and $msg.wParam.ToUInt64() -eq [uint64]$selected.Id) {
            Write-Output "TOGGLE"
            [Console]::Out.Flush()
        }
    }
}
finally {
    [SVOverlayHotKey]::UnregisterHotKey([IntPtr]::Zero, [int]$selected.Id) | Out-Null
}
`.replace("__CANDIDATES__", psArray());

export function registerOverlayHotkey(onToggle: () => void): GlobalHotkeyHandle {
  if (process.platform !== "win32") {
    logger.warn("Global hotkey is Windows-only in this build.");
    return {
      hotkey: null,
      ready: Promise.resolve(null),
      stop() {},
    };
  }

  const scriptPath = join(tmpdir(), `spiritvale-overlay-hotkey-${process.pid}.ps1`);
  writeFileSync(scriptPath, PS_SCRIPT, "utf8");

  const child = Bun.spawn({
    cmd: [
      "powershell.exe",
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-File",
      scriptPath,
    ],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  let stopped = false;
  let selectedHotkey: string | null = null;
  let resolveReady!: (value: string | null) => void;
  const ready = new Promise<string | null>((resolve) => { resolveReady = resolve; });
  let readyResolved = false;

  const finishReady = (value: string | null) => {
    if (readyResolved) return;
    readyResolved = true;
    selectedHotkey = value;
    resolveReady(value);
  };

  (async () => {
    try {
      const decoder = new TextDecoder();
      let pending = "";

      for await (const chunk of child.stdout) {
        pending += decoder.decode(chunk, { stream: true });

        while (true) {
          const nl = pending.indexOf("\n");
          if (nl < 0) break;

          const line = pending.slice(0, nl).trim();
          pending = pending.slice(nl + 1);

          if (line.startsWith("READY|")) {
            const [, label] = line.split("|");
            finishReady(label || null);
            logger.info(`Global hotkey ready: ${label}`);
          } else if (line === "FAILED") {
            finishReady(null);
            logger.warn("No global hotkey candidate could be registered.");
          } else if (line === "TOGGLE" && !stopped) {
            onToggle();
          }
        }
      }

      finishReady(selectedHotkey);
    } catch (err) {
      finishReady(null);
      if (!stopped) logger.warn(`Global hotkey listener stopped: ${String(err)}`);
    }
  })();

  return {
    get hotkey() { return selectedHotkey; },
    ready,
    stop() {
      if (stopped) return;
      stopped = true;
      try { child.kill(); } catch {}
      try { unlinkSync(scriptPath); } catch {}
    },
  };
}
