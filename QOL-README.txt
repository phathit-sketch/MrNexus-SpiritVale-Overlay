SpiritVale Overlay — v1.0 QoL

Added:
- Global Windows hotkey to hide/show overlay. Default hotkey: Ctrl+Alt+O.
- Hiding UI does NOT stop capture, grind tracking, or rare-drop sounds.
- Window X/Y and normal width/height are remembered in settings.json.
- Collapsed header height is not saved as the next startup size.
- Last selected Drops / Grind / History tab remains remembered via localStorage.
- Preferences now fade/slide both open and closed (~140 ms).
- Tooltips/title hints expanded for major buttons.
- Preferences shows the Ctrl+Shift+O shortcut.

New file:
- src/bun/hotkey-win.ts

Important:
- Hotkey is registered globally on Windows. If another app already owns Ctrl+Shift+O,
  the overlay continues working but logs that the hotkey could not be registered.
