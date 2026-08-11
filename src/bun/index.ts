/**
 * SpiritVale Drops Overlay — แอปเดียวจบ
 *   - เปิดหน้าต่าง overlay (โปร่งใส ไร้กรอบ ลอยบนสุด, คลิกได้โดยไม่แย่งโฟกัสเกม)
 *   - รัน capture + WebSocket server ในตัว (ไม่ต้องเปิด terminal แยก)
 *   - เสียง+overlay เฉพาะของที่เราฆ่าดรอปบนพื้น
 * ต้องมี Npcap ติดตั้งในเครื่อง (https://npcap.com)
 */
import { logger } from "../core/logger";
import { APP_AUTHOR, APP_NAME, APP_VERSION } from "../core/version";
import { BrowserView, BrowserWindow } from "electrobun/bun";
import { registerOverlayHotkey } from "./hotkey-win.ts";
import type { OverlayRpc } from "../rpc-types.ts";
import { dpiAware, hideFromTaskbar, setInteractive, setWindowAlpha } from "../win32.ts";
import { startWsServer } from "../core/ws-server.ts";
import { startCapture, setVolume, setOwnOnly, startGrind, stopGrind, refreshRuntimeProfile } from "../core/capture.ts";
import { getSettings, setVolumeSetting, setOwnOnlySetting, setSoundEnabled, setActiveProfile, createProfile, deleteProfile, listSoundPacks, setSoundPack, settingsFilePath, soundPacksDir, configDirectory, getRememberedWindowFrame, rememberWindowFrame } from "../core/runtime-config.ts";

const PORT = 8777;
let toggleHotkey = "Ctrl+Alt+O";


function openExplorer(path: string, selectFile = false): boolean {
  try {
    const arg = selectFile ? `/select,${path}` : path;
    Bun.spawn({ cmd: ["explorer.exe", arg], stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    return true;
  } catch {
    return false;
  }
}


dpiAware(); // ก่อนสร้างหน้าต่าง (ข้อความคม)

logger.startup();

process.on("uncaughtException", (err) => {
  logger.exception(err);
});

process.on("unhandledRejection", (reason) => {
  logger.exception(reason);
});

let win: BrowserWindow;
let ptr: unknown;
let overlayVisible = true;

function toggleOverlayVisibility(): void {
  overlayVisible = !overlayVisible;

  if (overlayVisible) {
    // showInactive keeps the game from losing focus.
    win.showInactive();
    win.setAlwaysOnTop(true);
  } else {
    win.hide();
  }
}

const rpc = BrowserView.defineRPC<OverlayRpc>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      setSize: ({ width, height }) => { win.setSize(Math.max(240, Math.round(width)), Math.max(30, Math.round(height))); return true; },
      getFrame: () => win.getFrame(),
      focus: () => { win.activate(); return true; },
      setOpacity: ({ alpha }) => { setWindowAlpha(ptr, alpha); return true; },
      setVolume: ({ volume }) => { setVolume(volume); setVolumeSetting(volume); return true; },
      setOwnOnly: ({ on }) => { setOwnOnly(on); setOwnOnlySetting(on); return true; },
      getSettings: () => getSettings(),
      setSoundEnabled: ({ key, enabled }) => { const s = setSoundEnabled(key as any, enabled); refreshRuntimeProfile(); return s; },
      listSoundPacks: () => listSoundPacks(),
      setSoundPack: ({ name }) => { const s = setSoundPack(name); refreshRuntimeProfile(); return s; },
      openConfig: () => { configDirectory(); return openExplorer(settingsFilePath(), true); },
      openSounds: () => openExplorer(soundPacksDir()),
      getAbout: () => ({ name: APP_NAME, version: APP_VERSION, author: APP_AUTHOR, hotkey: toggleHotkey }),
      setActiveProfile: ({ name }) => { const s = setActiveProfile(name); refreshRuntimeProfile(); return s; },
      createProfile: ({ name }) => { const s = createProfile(name); refreshRuntimeProfile(); return s; },
      deleteProfile: ({ name }) => { const s = deleteProfile(name); refreshRuntimeProfile(); return s; },
      startGrind: ({ durationMin }) => { startGrind(durationMin); return true; },
      stopGrind: () => { stopGrind(); return true; },
      toggleOverlay: () => { toggleOverlayVisibility(); return overlayVisible; },
      quit: () => { hotkeyHandle?.stop(); setTimeout(() => process.exit(0), 50); return true; },
    },
    messages: {},
  },
});

const rememberedFrame = getRememberedWindowFrame();

win = new BrowserWindow({
  title: "SpiritVale Drops Overlay",
  url: "views://overlayview/index.html",
  frame: rememberedFrame,
  titleBarStyle: "hidden",
  transparent: false, // ทึบ -> คลิกได้ทุกจุด (see-through ใช้ win32 opacity ทั้งหน้าต่าง)
  rpc,
});
win.setAlwaysOnTop(true);
win.show();

ptr = (win as any).ptr;
hideFromTaskbar(ptr);
setInteractive(ptr); // NOACTIVATE -> คลิก/ปรับได้ตลอด โดยไม่แย่งโฟกัสเกม

// Global QoL hotkey: only hides/shows the UI. Capture, grind tracking and
// rare-drop sounds continue running in the Bun process.
const hotkeyHandle = registerOverlayHotkey(toggleOverlayVisibility);
void hotkeyHandle.ready.then((selected) => {
  if (selected) {
    toggleHotkey = selected;
  } else {
    toggleHotkey = "Unavailable";
  }
});

// Remember native drag position + user resize without relying on window events.
// Collapsed header height is ignored by rememberWindowFrame().
let lastFrameKey = "";
setInterval(() => {
  try {
    const frame = win.getFrame();
    const key = `${frame.x},${frame.y},${frame.width},${frame.height}`;
    if (key !== lastFrameKey) {
      lastFrameKey = key;
      rememberWindowFrame(frame);
    }
  } catch {}
}, 750);

process.on("exit", () => {
  logger.shutdown();
  hotkeyHandle.stop();
});

// WS server + capture (ในตัว)
const { broadcast } = startWsServer(PORT);
startCapture(broadcast)
  .then(() => {
    logger.info("Packet capture started.");
  })
  .catch((e) => {
    logger.error(`Capture start failed: ${e?.stack ?? e?.message ?? String(e)}`);
  });
