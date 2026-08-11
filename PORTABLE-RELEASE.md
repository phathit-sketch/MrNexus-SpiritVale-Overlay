# SpiritVale Drops Overlay — Portable Release

Your Electrobun config already builds to `dist/electrobun` and uses `dist/artifacts`
for artifacts, so the portable packer intentionally copies the built runtime bundle
instead of using the installer artifact.

## Add these files to the project

```text
scripts/
  release-portable.ts
  portable-launcher.ts

src/core/
  runtime-config.ts   <- replace with the provided version
```

## package.json

Do NOT remove your existing `build:stable`.

Add:

```json
"release:portable": "bun run scripts/release-portable.ts"
```

For example:

```json
{
  "scripts": {
    "dev": "electrobun dev",
    "build:stable": "YOUR EXISTING COMMAND",
    "release:portable": "bun run scripts/release-portable.ts"
  }
}
```

## Build

```powershell
bun run release:portable
```

The command automatically:

1. Runs `bun run build:stable`
2. Finds Electrobun's generated `stable-win-x64/*-Setup.tar.zst`
3. Extracts the exact payload that Setup.exe would normally install, then keeps that runtime structure intact
4. Copies your current `sounds/`
5. Creates `data/`
6. Compiles a root `SpiritValeDropsOverlay.exe`
7. Creates a ZIP

Result:

```text
dist/
└─ portable/
   ├─ SpiritValeDropsOverlay-v1.0.0-win64/
   │  ├─ SpiritValeDropsOverlay.exe
   │  ├─ portable-app.json
   │  ├─ README-PORTABLE.txt
   │  ├─ app/
   │  │  ├─ bin/
   │  │  └─ Resources/
   │  ├─ sounds/
   │  │  └─ packs/
   │  └─ data/
   └─ SpiritValeDropsOverlay-v1.0.0-win64.zip
```

Give users only the ZIP.

Usage for users:

```text
Download ZIP
→ Extract
→ Open SpiritValeDropsOverlay.exe
```

No Setup.exe and no installer.

## Portable settings

The provided `runtime-config.ts` detects the portable launcher environment.

Portable release:

```text
data/settings.json
```

Development / old direct build:

```text
%APPDATA%\SpiritValeDropsOverlay\settings.json
```

This means `bun run dev` continues behaving like before, while the release ZIP is
actually self-contained.


## Why the first script failed

This project's current Electrobun version does not leave an unpacked stable app
bundle in `dist/electrobun/stable-win-x64`. Instead the stable build produces:

```text
*-Setup.exe
*-Setup.tar.zst
*-Setup.metadata.json
```

The fixed script uses the `Setup.tar.zst` payload directly. The user still does
not run Setup.exe.

Extraction order:

1. Windows `tar.exe` (no extra install)
2. If that cannot read zstd, automatically try 7-Zip if installed
