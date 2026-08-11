# SpiritVale Drops Overlay

**Version 1.0.0 — Created by MrNexus**

A lightweight, portable overlay for SpiritVale that reads network traffic through Npcap to provide rare-drop notifications, grind tracking, drop history, profiles, and custom sound packs.

> This is a community-made utility. It does not modify SpiritVale game files.

## Features

- Rare-drop sound notifications
- Own-drop filtering
- Grind session tracking (time, kills, coins, EXP)
- Rare-drop history and daily statistics
- Profiles for volume, ownership filtering, and sound filters
- Custom sound packs with automatic Default fallback
- Portable settings and logs
- Global **Ctrl + Alt + O** hotkey to hide/show the overlay while capture continues

## Requirements

- Windows 10 or Windows 11 (64-bit)
- [Npcap](https://npcap.com/) installed

Npcap is required because the overlay captures network packets. The overlay itself does not need to be installed.

## Installation

1. Install Npcap if it is not already installed.
2. Download `SpiritValeDropsOverlay-v1.0.0-win64.zip`.
3. Extract the ZIP completely. Do **not** run it from inside the ZIP.
4. Open:

   `bin/SpiritValeDropsOverlay.exe`

5. Start SpiritVale and play normally.

## Portable folders

```text
SpiritValeDropsOverlay-v1.0.0-win64/
├─ bin/
│  └─ SpiritValeDropsOverlay.exe
├─ Resources/
├─ sounds/
│  └─ packs/
└─ data/
   ├─ settings.json
   └─ logs/
```

Deleting the extracted folder removes the application and its portable settings.

## Sound Packs

Default sounds live in `sounds/`. Custom packs go in:

```text
sounds/packs/MyPack/
```

A custom pack only needs the files it wants to replace. Missing files automatically use the Default sound.

Supported override names:

```text
card_boss.mp3
card_normal.wav
gem_boss.mp3
gem_normal.wav
essence.wav
eggs.wav
lure_boss.wav
```

## Hotkey

**Ctrl + Alt + O** — Hide / Show Overlay

Packet capture, grind tracking, and drop sounds continue while the UI is hidden.

## Troubleshooting

**Overlay opens but does not capture anything**  
Confirm that Npcap is installed and restart the overlay. A Windows restart may be required immediately after installing Npcap.

**Where are my settings?**  
`data/settings.json`

**Where are crash/application logs?**  
`data/logs/`

**Where do I put custom sounds?**  
`sounds/packs/<PackName>/`

## Credits

Created by **MrNexus**.

SpiritVale and its related names/assets belong to their respective owners.
