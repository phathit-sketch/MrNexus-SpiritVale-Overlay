/** Overlay view — feed (ใหม่อยู่ล่าง) + opacity + ย่อ/ขยาย + resize (ผ่าน RPC) */
import { Electroview } from "electrobun/view";
import type { OverlayRpc } from "../rpc-types.ts";

const rpc = Electroview.defineRPC<OverlayRpc>({ handlers: { requests: {}, messages: {} } });
const electroview = new Electroview({ rpc });

const feed = document.getElementById("feed")!;
const st = document.getElementById("st")!;
const cntEl = document.getElementById("cnt")!;
let cnt = 0;

type FeedEvent = { side: "ground" | "pickup"; sound: string; name: string; ts?: number };

type RareHistoryEntry = { name: string; sound: string; ts: number };
const HISTORY_KEY = "ov_rare_history_v1";
const HISTORY_MAX = 500;
let rareHistory: RareHistoryEntry[] = [];

function loadRareHistory(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    rareHistory = Array.isArray(raw)
      ? raw.filter((x) => x && typeof x.name === "string" && typeof x.sound === "string" && Number.isFinite(x.ts)).slice(-HISTORY_MAX)
      : [];
  } catch {
    rareHistory = [];
  }
}

function saveRareHistory(): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(rareHistory.slice(-HISTORY_MAX))); } catch {}
}

function rememberRare(e: FeedEvent): void {
  if (e.side !== "ground" || !e.name) return;
  rareHistory.push({ name: e.name, sound: e.sound || "", ts: e.ts || Date.now() });
  if (rareHistory.length > HISTORY_MAX) rareHistory.splice(0, rareHistory.length - HISTORY_MAX);
  saveRareHistory();
  renderHistory();
  updateTabBadges();
}

function itemTypeIcon(sound: string): string {
  const s = (sound || "").toLowerCase();
  if (s.includes("card")) return "🃏";
  if (s.includes("gem")) return "💎";
  if (s.includes("essence")) return "✨";
  if (s.includes("egg")) return "🥚";
  if (s.includes("lure")) return "🎣";
  return "⭐";
}

function add(e: FeedEvent) {
  const row = document.createElement("div");
  row.className = "row " + (e.side === "ground" ? "ground" : "pickup") + " " + (e.sound || "");
  const t = new Date(e.ts || Date.now()).toLocaleTimeString("th-TH", { hour12: false });
  const tm = document.createElement("span"); tm.className = "tm"; tm.textContent = t;
  const msg = document.createElement("span"); msg.className = "msg";
  const icon = document.createElement("span"); icon.className = "itemIcon"; icon.textContent = itemTypeIcon(e.sound);
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = e.name;
  if (e.side === "ground") {
    const v = document.createElement("span"); v.className = "v"; v.textContent = "ดรอปบนพื้น";
    msg.append(icon, " ", nm, " ", v);
  } else {
    const v0 = document.createElement("span"); v0.className = "v"; v0.textContent = "คุณเก็บ";
    const v2 = document.createElement("span"); v2.className = "v"; v2.textContent = "ได้";
    msg.append(v0, " ", icon, " ", nm, " ", v2);
  }
  row.append(tm, msg);
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  feed.appendChild(row);
  while (feed.children.length > 200) feed.removeChild(feed.firstChild!);
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  cnt++; cntEl.textContent = String(cnt);
  rememberRare(e);
  updateTabBadges();
}

// ---------- Settings / Profiles ----------
type SoundFilterKey =
  | "lure_boss"
  | "eggs"
  | "card_boss"
  | "card_normal"
  | "gem_boss"
  | "gem_normal"
  | "essence";

type Profile = {
  volume: number;
  ownOnly: boolean;
  soundPack: string;
  enabledSounds: Record<SoundFilterKey, boolean>;
};

type RuntimeSettings = {
  version: 1;
  activeProfile: string;
  profiles: Record<string, Profile>;
};

const SOUND_KEYS: SoundFilterKey[] = [
  "card_boss",
  "card_normal",
  "gem_boss",
  "gem_normal",
  "essence",
  "eggs",
  "lure_boss",
];

const op = document.getElementById("op") as HTMLInputElement;
const opValue = document.getElementById("opValue")!;
const vol = document.getElementById("vol") as HTMLInputElement;
const volValue = document.getElementById("volValue")!;
const own = document.getElementById("own") as HTMLInputElement;
const profileSelect = document.getElementById("profileSelect") as HTMLSelectElement;
const profileNew = document.getElementById("profileNew") as HTMLButtonElement;
const profileDuplicate = document.getElementById("profileDuplicate") as HTMLButtonElement;
const profileDelete = document.getElementById("profileDelete") as HTMLButtonElement;
const soundPackSelect = document.getElementById("soundPackSelect") as HTMLSelectElement;
const openSoundsBtn = document.getElementById("openSoundsBtn") as HTMLButtonElement;
const soundsAll = document.getElementById("soundsAll") as HTMLButtonElement;
const soundsNone = document.getElementById("soundsNone") as HTMLButtonElement;
const openConfigBtn = document.getElementById("openConfigBtn") as HTMLButtonElement;
const aboutBtn = document.getElementById("aboutBtn") as HTMLButtonElement;
const settingsStatus = document.getElementById("settingsStatus")!;
const hotkeyDisplay = document.getElementById("hotkeyDisplay")!;
const soundChecks = [...document.querySelectorAll<HTMLInputElement>('input[data-sound-key]')];

let runtimeSettings: RuntimeSettings | null = null;
let applyingSettings = false;

function setSettingsStatus(text: string, isError = false): void {
  settingsStatus.textContent = text;
  settingsStatus.classList.toggle("error", isError);
  if (text) {
    window.setTimeout(() => {
      if (settingsStatus.textContent === text) settingsStatus.textContent = "";
    }, 1800);
  }
}

// Opacity is intentionally GLOBAL, not profile-specific.
op.value = localStorage.getItem("ov_alpha") || "86";
opValue.textContent = `${op.value}%`;

const applyOp = () => {
  opValue.textContent = `${op.value}%`;
  const alpha = Math.round((Number(op.value) / 100) * 255);
  void electroview.rpc?.request.setOpacity({ alpha });
  localStorage.setItem("ov_alpha", op.value);
};
op.addEventListener("input", applyOp);

function activeProfile(): Profile | null {
  if (!runtimeSettings) return null;
  return runtimeSettings.profiles[runtimeSettings.activeProfile] ?? null;
}

function renderProfileOptions(): void {
  if (!runtimeSettings) return;

  const current = runtimeSettings.activeProfile;
  profileSelect.replaceChildren();

  for (const name of Object.keys(runtimeSettings.profiles)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === current;
    profileSelect.appendChild(option);
  }

  profileDelete.disabled = Object.keys(runtimeSettings.profiles).length <= 1;
}

function renderProfileSettings(): void {
  if (!runtimeSettings) return;
  const p = activeProfile();
  if (!p) return;

  applyingSettings = true;
  renderProfileOptions();

  vol.value = String(Math.round(p.volume * 100));
  volValue.textContent = `${vol.value}%`;
  own.checked = p.ownOnly;

  for (const input of soundChecks) {
    const key = input.dataset.soundKey as SoundFilterKey;
    input.checked = p.enabledSounds[key] !== false;
  }

  if ([...soundPackSelect.options].some((o) => o.value === p.soundPack)) {
    soundPackSelect.value = p.soundPack;
  }

  applyingSettings = false;
}

function renderHotkeyLabel(label: string): void {
  hotkeyDisplay.replaceChildren();

  const keyboard = document.createElement("span");
  keyboard.className = "hotkeyKeyboard";
  keyboard.textContent = "⌨";
  hotkeyDisplay.appendChild(keyboard);

  if (!label || label === "Unavailable") {
    const unavailable = document.createElement("span");
    unavailable.textContent = "Unavailable";
    unavailable.className = "hotkeyUnavailable";
    hotkeyDisplay.appendChild(unavailable);
    return;
  }

  const parts = label.split("+");
  parts.forEach((part, index) => {
    if (index > 0) {
      const plus = document.createElement("span");
      plus.textContent = "+";
      hotkeyDisplay.appendChild(plus);
    }

    const key = document.createElement("kbd");
    key.textContent = part;
    hotkeyDisplay.appendChild(key);
  });
}

async function loadHotkeyInfo(): Promise<void> {
  try {
    // Give the native helper a moment to finish fallback registration.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const info = await electroview.rpc?.request.getAbout({});
    if (info?.hotkey) renderHotkeyLabel(info.hotkey);
  } catch {}
}

async function loadRuntimeSettings(): Promise<void> {
  try {
    const result = await electroview.rpc?.request.getSettings({});
    if (!result) throw new Error("No settings returned");
    runtimeSettings = result as RuntimeSettings;

    const packs = await electroview.rpc?.request.listSoundPacks({});
    soundPackSelect.replaceChildren();
    for (const name of (packs || ["Default"])) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      soundPackSelect.appendChild(option);
    }

    renderProfileSettings();
  } catch (err) {
    console.warn("[settings] load failed", err);
    setSettingsStatus("Settings unavailable", true);
  }
}

// Volume and own-only are PROFILE settings and are persisted by Bun backend.
vol.addEventListener("input", () => {
  volValue.textContent = `${vol.value}%`;
});

vol.addEventListener("change", async () => {
  if (applyingSettings) return;
  try {
    await electroview.rpc?.request.setVolume({ volume: Number(vol.value) / 100 });
    if (runtimeSettings) {
      const p = activeProfile();
      if (p) p.volume = Number(vol.value) / 100;
    }
    setSettingsStatus("Saved");
  } catch {
    setSettingsStatus("Save failed", true);
  }
});

own.addEventListener("change", async () => {
  if (applyingSettings) return;
  try {
    await electroview.rpc?.request.setOwnOnly({ on: own.checked });
    if (runtimeSettings) {
      const p = activeProfile();
      if (p) p.ownOnly = own.checked;
    }
    setSettingsStatus("Saved");
  } catch {
    setSettingsStatus("Save failed", true);
  }
});

for (const input of soundChecks) {
  input.addEventListener("change", async () => {
    if (applyingSettings) return;
    const key = input.dataset.soundKey as SoundFilterKey;

    try {
      const result = await electroview.rpc?.request.setSoundEnabled({
        key,
        enabled: input.checked,
      });
      runtimeSettings = result as RuntimeSettings;
      renderProfileSettings();
      setSettingsStatus("Saved");
    } catch {
      setSettingsStatus("Save failed", true);
    }
  });
}

profileSelect.addEventListener("change", async () => {
  try {
    const result = await electroview.rpc?.request.setActiveProfile({
      name: profileSelect.value,
    });
    runtimeSettings = result as RuntimeSettings;
    renderProfileSettings();
    setSettingsStatus(`Profile: ${runtimeSettings.activeProfile}`);
  } catch {
    renderProfileSettings();
    setSettingsStatus("Profile switch failed", true);
  }
});

profileNew.addEventListener("click", async () => {
  const name = prompt("New profile name:");
  if (!name?.trim()) return;

  try {
    const result = await electroview.rpc?.request.createProfile({ name: name.trim() });
    runtimeSettings = result as RuntimeSettings;
    renderProfileSettings();
    setSettingsStatus(`Created: ${runtimeSettings.activeProfile}`);
  } catch (err: any) {
    setSettingsStatus(err?.message || "Create failed", true);
  }
});

profileDelete.addEventListener("click", async () => {
  if (!runtimeSettings) return;
  const name = runtimeSettings.activeProfile;
  if (!confirm(`Delete profile "${name}"?`)) return;

  try {
    const result = await electroview.rpc?.request.deleteProfile({ name });
    runtimeSettings = result as RuntimeSettings;
    renderProfileSettings();
    setSettingsStatus("Profile deleted");
  } catch (err: any) {
    setSettingsStatus(err?.message || "Delete failed", true);
  }
});


soundPackSelect.addEventListener("change", async () => {
  if (applyingSettings) return;
  try {
    const result = await electroview.rpc?.request.setSoundPack({ name: soundPackSelect.value });
    runtimeSettings = result as RuntimeSettings;
    renderProfileSettings();
    setSettingsStatus(`Sound pack: ${soundPackSelect.value}`);
  } catch {
    setSettingsStatus("Sound pack failed", true);
  }
});

openSoundsBtn.addEventListener("click", async () => {
  await electroview.rpc?.request.openSounds({});
  setSettingsStatus("Opened sounds/packs");
});

openConfigBtn.addEventListener("click", async () => {
  await electroview.rpc?.request.openConfig({});
});

async function setAllSounds(enabled: boolean): Promise<void> {
  for (const input of soundChecks) {
    const key = input.dataset.soundKey as SoundFilterKey;
    const result = await electroview.rpc?.request.setSoundEnabled({ key, enabled });
    runtimeSettings = result as RuntimeSettings;
  }
  renderProfileSettings();
  setSettingsStatus(enabled ? "All sounds enabled" : "All sounds disabled");
}

soundsAll.addEventListener("click", () => void setAllSounds(true));
soundsNone.addEventListener("click", () => void setAllSounds(false));

profileDuplicate.addEventListener("click", async () => {
  if (!runtimeSettings) return;
  const suggested = `${runtimeSettings.activeProfile} Copy`;
  const name = prompt("Duplicate profile as:", suggested);
  if (!name?.trim()) return;
  try {
    const result = await electroview.rpc?.request.createProfile({ name: name.trim() });
    runtimeSettings = result as RuntimeSettings;
    renderProfileSettings();
    setSettingsStatus(`Created: ${runtimeSettings.activeProfile}`);
  } catch (err: any) {
    setSettingsStatus(err?.message || "Duplicate failed", true);
  }
});


const aboutBackdrop = document.getElementById("aboutBackdrop")!;
const aboutName = document.getElementById("aboutName")!;
const aboutVersion = document.getElementById("aboutVersion")!;
const aboutAuthor = document.getElementById("aboutAuthor")!;
const aboutClose = document.getElementById("aboutClose") as HTMLButtonElement;

aboutBtn.addEventListener("click", async () => {
  try {
    const info = await electroview.rpc?.request.getAbout({});
    if (info) {
      aboutName.textContent = info.name;
      aboutVersion.textContent = `Version ${info.version}`;
      aboutAuthor.textContent = info.author || "MrNexus";
    }
  } catch {}
  aboutBackdrop.classList.remove("hidden");
});

aboutClose.addEventListener("click", () => aboutBackdrop.classList.add("hidden"));
aboutBackdrop.addEventListener("click", (e) => {
  if (e.target === aboutBackdrop) aboutBackdrop.classList.add("hidden");
});

// Settings popover
const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
const settingsPopover = document.getElementById("settingsPopover")!;

let settingsCloseTimer = 0;

function settingsIsOpen(): boolean {
  return settingsPopover.classList.contains("open");
}

function setSettingsOpen(open: boolean): void {
  window.clearTimeout(settingsCloseTimer);
  settingsBtn.classList.toggle("active", open);

  if (open) {
    settingsPopover.classList.remove("hidden");
    requestAnimationFrame(() => {
      settingsPopover.classList.add("open");
    });
  } else {
    settingsPopover.classList.remove("open");
    settingsCloseTimer = window.setTimeout(() => {
      if (!settingsIsOpen()) settingsPopover.classList.add("hidden");
    }, 145);
  }
}

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setSettingsOpen(!settingsIsOpen());
});

settingsPopover.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => setSettingsOpen(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setSettingsOpen(false);
    aboutBackdrop.classList.add("hidden");
  }
});

// Apply global opacity + load backend profile after RPC is ready.
setTimeout(() => {
  applyOp();
  void loadRuntimeSettings();
  void loadHotkeyInfo();
}, 300);

// ย่อ/ขยาย (หดหน้าต่างจริง)
const minBtn = document.getElementById("min") as HTMLButtonElement;
let savedH = 0;
minBtn.addEventListener("click", async () => {
  const a = document.getElementById("app")!;
  const f = await electroview.rpc?.request.getFrame({});
  const w = f?.width ?? 360;
  if (!a.classList.contains("collapsed")) {
    setSettingsOpen(false);
    savedH = f?.height ?? 440;
    const hH = Math.ceil((document.querySelector("header") as HTMLElement).getBoundingClientRect().height); // วัดก่อนใส่ collapsed
    a.classList.add("collapsed"); minBtn.textContent = "▢";
    await electroview.rpc?.request.setSize({ width: w, height: hH });
  } else {
    a.classList.remove("collapsed"); minBtn.textContent = "▁";
    await electroview.rpc?.request.setSize({ width: w, height: savedH || 440 });
  }
});

// resize (มุมขวาล่าง) ผ่าน RPC
const rz = document.getElementById("rz")!;
let start: { mx: number; my: number; w: number; h: number } | null = null;
let raf = 0, pending: { width: number; height: number } | null = null;
function flush() { raf = 0; if (pending) { void electroview.rpc?.request.setSize(pending); pending = null; } }
rz.addEventListener("pointerdown", (e) => {
  start = { mx: e.screenX, my: e.screenY, w: window.innerWidth, h: window.innerHeight };
  (rz as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault();
});
rz.addEventListener("pointermove", (e) => {
  if (!start) return;
  pending = { width: Math.max(240, start.w + (e.screenX - start.mx)), height: Math.max(120, start.h + (e.screenY - start.my)) };
  if (!raf) raf = requestAnimationFrame(flush);
});
rz.addEventListener("pointerup", (e) => { start = null; try { (rz as HTMLElement).releasePointerCapture(e.pointerId); } catch {} });

// ปุ่มปิดโปรแกรม
const closeBtn = document.getElementById("close") as HTMLButtonElement;
closeBtn.addEventListener("click", () => { void electroview.rpc?.request.quit({}); });

// ---------- Top-level tabs ----------
const dropsView = document.getElementById("dropsView")!;
const grindView = document.getElementById("grindView")!;
const historyView = document.getElementById("historyView")!;
const tabDrops = document.getElementById("tabDrops") as HTMLButtonElement;
const tabGrind = document.getElementById("tabGrind") as HTMLButtonElement;
const tabHistory = document.getElementById("tabHistory") as HTMLButtonElement;

type ViewName = "drops" | "grind" | "history";

function updateTabBadges(): void {
  const todayCount = rareHistory.filter((x) => isToday(x.ts)).length;
  tabDrops.textContent = cnt > 0 ? `🎯 Drops ${cnt}` : "🎯 Drops";
  tabGrind.textContent = "📊 Grind";
  tabHistory.textContent = todayCount > 0 ? `🕘 History ${todayCount}` : "🕘 History";
}


function setView(view: ViewName): void {
  dropsView.classList.toggle("active", view === "drops");
  grindView.classList.toggle("active", view === "grind");
  historyView.classList.toggle("active", view === "history");
  tabDrops.classList.toggle("active", view === "drops");
  tabGrind.classList.toggle("active", view === "grind");
  tabHistory.classList.toggle("active", view === "history");
  localStorage.setItem("ov_view", view);
  if (view === "history") renderHistory();
}

tabDrops.addEventListener("click", () => setView("drops"));
tabGrind.addEventListener("click", () => setView("grind"));
tabHistory.addEventListener("click", () => setView("history"));

const savedView = localStorage.getItem("ov_view");
setView(savedView === "grind" || savedView === "history" ? savedView : "drops");
updateTabBadges();

// ---------- Rare History + Statistics ----------
const historyList = document.getElementById("historyList")!;
const historyStatsList = document.getElementById("historyStatsList")!;
const hTodayTotal = document.getElementById("hTodayTotal")!;
const hTodayUnique = document.getElementById("hTodayUnique")!;
const hClear = document.getElementById("hClear") as HTMLButtonElement;

function isToday(ts: number): boolean {
  const a = new Date(ts), b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function countByName(entries: RareHistoryEntry[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.name, (m.get(e.name) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderHistory(): void {
  const today = rareHistory.filter((x) => isToday(x.ts));
  const stats = countByName(today);

  hTodayTotal.textContent = fmt(today.length);
  hTodayUnique.textContent = fmt(stats.length);

  historyStatsList.replaceChildren();
  if (!stats.length) {
    historyStatsList.className = "statsList empty";
    historyStatsList.textContent = "ยังไม่มี rare drop วันนี้";
  } else {
    historyStatsList.className = "statsList";
    for (const [name, count] of stats) {
      const row = document.createElement("div");
      row.className = "statRow";
      const nm = document.createElement("span");
      nm.className = "statName";
      nm.textContent = name;
      const ct = document.createElement("span");
      ct.className = "statCount";
      ct.textContent = `×${fmt(count)}`;
      row.append(nm, ct);
      historyStatsList.appendChild(row);
    }
  }

  historyList.replaceChildren();
  if (!rareHistory.length) {
    historyList.className = "historyList empty";
    historyList.textContent = "ยังไม่มีประวัติ";
  } else {
    historyList.className = "historyList";
    for (const e of [...rareHistory].reverse()) {
      const row = document.createElement("div");
      row.className = "historyRow";
      const tm = document.createElement("span");
      tm.className = "hTime";
      tm.textContent = new Date(e.ts).toLocaleString("th-TH", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false });
      const nm = document.createElement("span");
      nm.className = "hName";
      nm.textContent = e.name;
      const sd = document.createElement("span");
      sd.className = "hSound";
      sd.textContent = e.sound || "";
      row.append(tm, nm, sd);
      historyList.appendChild(row);
    }
  }
}

hClear.addEventListener("click", () => {
  if (!confirm("ล้าง Rare History ทั้งหมด?")) return;
  rareHistory = [];
  saveRareHistory();
  renderHistory();
  updateTabBadges();
});

loadRareHistory();

// ---------- Grind tracker ----------
const gStart = document.getElementById("gStart") as HTMLButtonElement;
const gStop = document.getElementById("gStop") as HTMLButtonElement;
const gDur = document.getElementById("gDur") as HTMLInputElement;
const el = (id: string) => document.getElementById(id)!;

let gState = { running: false, startMs: 0, durationMs: 0, coins: 0, kills: 0, exp: 0 };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

function renderGrind(): void {
  const now = Date.now();
  let elapsed = gState.running
    ? now - gState.startMs
    : (gState.startMs ? Math.min(now - gState.startMs, gState.durationMs || Infinity) : 0);

  if (gState.durationMs > 0) {
    elapsed = Math.min(elapsed, gState.durationMs);
  }

  el("gTime").textContent = fmtTime(elapsed);
  el("gKills").textContent = fmt(gState.kills);
  el("gCoins").textContent = fmt(gState.coins);
  el("gExp").textContent = fmt(gState.exp);
}

// ---------- Session Summary ----------
const summaryBackdrop = document.getElementById("summaryBackdrop")!;
const summaryClose = document.getElementById("summaryClose") as HTMLButtonElement;
const summaryDate = document.getElementById("summaryDate")!;
const summaryRare = document.getElementById("summaryRare")!;
let lastSummaryStartMs = 0;

function sessionRareEntries(startMs: number, endMs: number): RareHistoryEntry[] {
  return startMs ? rareHistory.filter((x) => x.ts >= startMs && x.ts <= endMs) : [];
}

function showSessionSummary(state = gState): void {
  if (!state.startMs || state.startMs === lastSummaryStartMs) return;
  lastSummaryStartMs = state.startMs;

  const endMs = Date.now();
  let elapsed = Math.max(0, endMs - state.startMs);
  if (state.durationMs > 0) elapsed = Math.min(elapsed, state.durationMs);

  el("sTime").textContent = fmtTime(elapsed);
  el("sKills").textContent = fmt(state.kills);
  el("sCoins").textContent = fmt(state.coins);
  el("sExp").textContent = fmt(state.exp);
  summaryDate.textContent = new Date(state.startMs).toLocaleString("th-TH", { hour12:false });

  const counted = countByName(sessionRareEntries(state.startMs, endMs));
  summaryRare.replaceChildren();

  if (!counted.length) {
    summaryRare.className = "summaryRare empty";
    summaryRare.textContent = "ไม่มี rare drop ใน session นี้";
  } else {
    summaryRare.className = "summaryRare";
    for (const [name, count] of counted) {
      const row = document.createElement("div");
      row.className = "summaryRareRow";
      const nm = document.createElement("span");
      nm.textContent = name;
      const ct = document.createElement("b");
      ct.textContent = `×${fmt(count)}`;
      row.append(nm, ct);
      summaryRare.appendChild(row);
    }
  }

  summaryBackdrop.classList.remove("hidden");
}

function hideSessionSummary(): void {
  summaryBackdrop.classList.add("hidden");
}

summaryClose.addEventListener("click", hideSessionSummary);
summaryBackdrop.addEventListener("click", (e) => {
  if (e.target === summaryBackdrop) hideSessionSummary();
});

gStart.addEventListener("click", () => {
  const durationMin = Number(gDur.value) || 0;
  void electroview.rpc?.request.startGrind({ durationMin });

  gState = {
    running: true,
    startMs: Date.now(),
    durationMs: durationMin * 60000,
    coins: 0,
    kills: 0,
    exp: 0,
  };

  gStart.disabled = true;
  gStop.disabled = false;
  renderGrind();
});

gStop.addEventListener("click", () => {
  const finished = { ...gState, running: false };
  void electroview.rpc?.request.stopGrind({});
  gState.running = false;
  gStart.disabled = false;
  gStop.disabled = true;
  renderGrind();
  showSessionSummary(finished);
});

setInterval(() => {
  if (!gState.running) return;

  if (gState.durationMs > 0 && Date.now() - gState.startMs >= gState.durationMs) {
    const finished = { ...gState, running: false };
    gState.running = false;
    gStart.disabled = false;
    gStop.disabled = true;
    showSessionSummary(finished);
  }

  renderGrind();
}, 500);

// feed + grind จาก WebSocket
function connect() {
  const ws = new WebSocket("ws://localhost:8777/ws");

  ws.onopen = () => {
    st.textContent = "●"; st.title = "live";
    st.style.color = "#7ee081";
  };

  ws.onclose = () => {
    st.textContent = "○"; st.title = "reconnecting";
    st.style.color = "";
    setTimeout(connect, 1000);
  };

  ws.onmessage = (m) => {
    try {
      const msg = JSON.parse(m.data);

      if (msg && msg.type === "grind") {
        const wasRunning = gState.running;
        gState = {
          running: !!msg.running,
          startMs: msg.startMs || gState.startMs,
          durationMs: msg.durationMs || 0,
          coins: msg.coins || 0,
          kills: msg.kills || 0,
          exp: msg.exp || 0,
        };

        gStart.disabled = gState.running;
        gStop.disabled = !gState.running;
        renderGrind();

        if (wasRunning && !gState.running) {
          showSessionSummary(gState);
        }
      } else {
        add(msg);
      }
    } catch {}
  };
}

connect();