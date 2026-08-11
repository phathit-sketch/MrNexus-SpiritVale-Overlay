import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type SoundFilterKey =
  | "lure_boss"
  | "eggs"
  | "card_boss"
  | "card_normal"
  | "gem_boss"
  | "gem_normal"
  | "essence";

export type Profile = {
  volume: number;
  ownOnly: boolean;
  soundPack: string;
  enabledSounds: Record<SoundFilterKey, boolean>;
};

export type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RuntimeSettings = {
  version: 1;
  activeProfile: string;
  profiles: Record<string, Profile>;
  ui: {
    windowFrame: WindowFrame;
  };
};

const DEFAULT_PROFILE: Profile = {
  volume: 1,
  ownOnly: true,
  soundPack: "Default",
  enabledSounds: {
    lure_boss: true,
    eggs: true,
    card_boss: true,
    card_normal: true,
    gem_boss: true,
    gem_normal: true,
    essence: true,
  },
};

const SOUND_FILE_NAMES: Record<SoundFilterKey, string> = {
  lure_boss: "lure_boss.wav",
  eggs: "eggs.wav",
  card_boss: "card_boss.mp3",
  card_normal: "card_normal.wav",
  gem_boss: "gem_boss.mp3",
  gem_normal: "gem_normal.wav",
  essence: "essence.wav",
};

function detectPortableRoot(): string | null {
  // Preferred path: root portable launcher sets this environment variable.
  const fromEnv = process.env.SPIRITVALE_PORTABLE_DIR;
  if (fromEnv && existsSync(join(fromEnv, "portable-app.json"))) {
    return resolve(fromEnv);
  }

  // Robust fallback: when the internal Electrobun launcher is started directly,
  // Bun lives at:
  //   <portable>\app\bin\bun.exe
  // so <portable> is three directory levels above process.execPath.
  const exeDir = dirname(process.execPath);
  const candidates = [
    // Direct portable release:
    //   <portable>\\bin\\SpiritValeDropsOverlay.exe
    resolve(exeDir, ".."),

    // Older wrapper layout compatibility:
    //   <portable>\\app\\bin\\launcher.exe
    resolve(exeDir, "..", ".."),

    // Extra safety for older/nested runtime layouts.
    resolve(exeDir, "..", "..", ".."),

    // Useful during development/tests started from the portable root.
    resolve(process.cwd()),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "portable-app.json"))) {
      return candidate;
    }
  }

  return null;
}

function appDataDir(): string {
  const portableRoot = detectPortableRoot();
  if (portableRoot) {
    const p = join(portableRoot, "data");
    mkdirSync(p, { recursive: true });
    return p;
  }

  const base = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
  return join(base, "SpiritValeDropsOverlay");
}

function projectSoundsDir(): string {
  // Works both in dev and packaged layouts because sound.ts already resolves
  // the built-in default files from several bases. This path is only for
  // custom packs / opening Explorer.
  const portableRoot = detectPortableRoot();

  const candidates = [
    ...(portableRoot ? [join(portableRoot, "sounds")] : []),
    join(process.cwd(), "sounds"),
    join(process.execPath, "..", "sounds"),
    join(process.execPath, "..", "..", "Resources", "app", "sounds"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  const fallback = join(process.cwd(), "sounds");
  mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function soundPacksDir(): string {
  const p = join(projectSoundsDir(), "packs");
  mkdirSync(p, { recursive: true });
  return p;
}

export function listSoundPacks(): string[] {
  const root = soundPacksDir();
  const names = readdirSync(root, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => x.name.trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== "default")
    .sort((a, b) => a.localeCompare(b));

  // "Default" is synthetic and maps to the existing built-in sounds/ files.
  return ["Default", ...names];
}

const CUSTOM_SOUND_EXTENSIONS = [".wav", ".mp3"] as const;

/**
 * Resolve a custom sound by logical sound key rather than by one exact extension.
 *
 * Examples accepted for the "card_normal" key:
 *   card_normal.wav
 *   card_normal.mp3
 *
 * The basename must stay the same. If no compatible custom file exists,
 * return null so the caller can fall back to the built-in Default sound.
 */
export function resolveSoundPackOverride(key: SoundFilterKey): string | null {
  const profile = getActiveProfile();
  if (!profile.soundPack || profile.soundPack === "Default") return null;

  const packDir = join(soundPacksDir(), profile.soundPack);
  if (!existsSync(packDir)) return null;

  // Keep SOUND_FILE_NAMES as the source of truth for the required basename,
  // but do not force custom packs to use the same extension as Default.
  const configuredFile = SOUND_FILE_NAMES[key];
  const dot = configuredFile.lastIndexOf(".");
  const basename = dot >= 0 ? configuredFile.slice(0, dot) : configuredFile;
  const preferredExt = dot >= 0 ? configuredFile.slice(dot).toLowerCase() : "";

  // Prefer the Default extension first, then try the other supported format.
  const extensions = [
    preferredExt,
    ...CUSTOM_SOUND_EXTENSIONS.filter((ext) => ext !== preferredExt),
  ].filter(Boolean);

  // Direct lookup first (fast path).
  for (const ext of extensions) {
    const candidate = join(packDir, `${basename}${ext}`);
    if (existsSync(candidate)) return candidate;
  }

  // Case-insensitive fallback, useful for files such as CARD_NORMAL.MP3.
  try {
    const allowedNames = new Set(
      extensions.map((ext) => `${basename}${ext}`.toLowerCase())
    );

    const match = readdirSync(packDir, { withFileTypes: true }).find(
      (entry) => entry.isFile() && allowedNames.has(entry.name.toLowerCase())
    );

    return match ? join(packDir, match.name) : null;
  } catch {
    return null;
  }
}

function settingsPath(): string {
  return join(configDirectory(), "settings.json");
}

function cloneDefaultProfile(): Profile {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
}

function normalizeProfile(v: any): Profile {
  const p = cloneDefaultProfile();
  if (v && typeof v === "object") {
    if (Number.isFinite(Number(v.volume))) p.volume = Math.max(0, Math.min(1, Number(v.volume)));
    if (typeof v.ownOnly === "boolean") p.ownOnly = v.ownOnly;
    if (typeof v.soundPack === "string" && v.soundPack.trim()) p.soundPack = v.soundPack.trim();
    if (v.enabledSounds && typeof v.enabledSounds === "object") {
      for (const k of Object.keys(p.enabledSounds) as SoundFilterKey[]) {
        if (typeof v.enabledSounds[k] === "boolean") p.enabledSounds[k] = v.enabledSounds[k];
      }
    }
  }
  return p;
}

function normalizeSettings(v: any): RuntimeSettings {
  const profiles: Record<string, Profile> = {};
  if (v?.profiles && typeof v.profiles === "object") {
    for (const [name, profile] of Object.entries(v.profiles)) {
      if (name.trim()) profiles[name] = normalizeProfile(profile);
    }
  }
  if (!Object.keys(profiles).length) profiles.Default = cloneDefaultProfile();

  const activeProfile =
    typeof v?.activeProfile === "string" && profiles[v.activeProfile]
      ? v.activeProfile
      : Object.keys(profiles)[0];

  const rawFrame = v?.ui?.windowFrame;
  const windowFrame: WindowFrame = {
    x: Number.isFinite(Number(rawFrame?.x)) ? Math.round(Number(rawFrame.x)) : 40,
    y: Number.isFinite(Number(rawFrame?.y)) ? Math.round(Number(rawFrame.y)) : 40,
    width: Number.isFinite(Number(rawFrame?.width)) ? Math.max(240, Math.round(Number(rawFrame.width))) : 420,
    height: Number.isFinite(Number(rawFrame?.height)) ? Math.max(120, Math.round(Number(rawFrame.height))) : 200,
  };

  return { version: 1, activeProfile, profiles, ui: { windowFrame } };
}

let settings: RuntimeSettings = load();

function load(): RuntimeSettings {
  try {
    const path = settingsPath();
    if (!existsSync(path)) return normalizeSettings(null);
    return normalizeSettings(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return normalizeSettings(null);
  }
}

function save(): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf8");
}

export function getSettings(): RuntimeSettings {
  return JSON.parse(JSON.stringify(settings));
}

export function getActiveProfile(): Profile {
  return settings.profiles[settings.activeProfile] ?? cloneDefaultProfile();
}

export function setVolumeSetting(volume: number): RuntimeSettings {
  settings.profiles[settings.activeProfile].volume = Math.max(0, Math.min(1, volume));
  save();
  return getSettings();
}

export function setOwnOnlySetting(ownOnly: boolean): RuntimeSettings {
  settings.profiles[settings.activeProfile].ownOnly = ownOnly;
  save();
  return getSettings();
}

export function setSoundEnabled(key: SoundFilterKey, enabled: boolean): RuntimeSettings {
  settings.profiles[settings.activeProfile].enabledSounds[key] = enabled;
  save();
  return getSettings();
}

export function setActiveProfile(name: string): RuntimeSettings {
  if (!settings.profiles[name]) throw new Error(`Unknown profile: ${name}`);
  settings.activeProfile = name;
  save();
  return getSettings();
}

export function createProfile(name: string, copyFromActive = true): RuntimeSettings {
  const clean = name.trim();
  if (!clean) throw new Error("Profile name is empty");
  if (settings.profiles[clean]) throw new Error("Profile already exists");
  settings.profiles[clean] = copyFromActive ? getActiveProfile() : cloneDefaultProfile();
  settings.activeProfile = clean;
  save();
  return getSettings();
}

export function deleteProfile(name: string): RuntimeSettings {
  if (!settings.profiles[name]) return getSettings();
  if (Object.keys(settings.profiles).length <= 1) throw new Error("Cannot delete the last profile");
  delete settings.profiles[name];
  if (settings.activeProfile === name) settings.activeProfile = Object.keys(settings.profiles)[0];
  save();
  return getSettings();
}

export function settingsFilePath(): string {
  return settingsPath();
}


export function setSoundPack(name: string): RuntimeSettings {
  const packs = listSoundPacks();
  if (!packs.includes(name)) throw new Error(`Unknown sound pack: ${name}`);
  settings.profiles[settings.activeProfile].soundPack = name;
  save();
  return getSettings();
}

export function configDirectory(): string {
  const p = appDataDir();
  mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Writable application data directory.
 *
 * Portable:
 *   <portable>\\data
 *
 * Dev / non-portable:
 *   %APPDATA%\\SpiritValeDropsOverlay
 */
export function dataDirectory(): string {
  return configDirectory();
}

export function logsDirectory(): string {
  const p = join(dataDirectory(), "logs");
  mkdirSync(p, { recursive: true });
  return p;
}


export function getRememberedWindowFrame(): WindowFrame {
  return { ...settings.ui.windowFrame };
}

export function rememberWindowFrame(frame: WindowFrame): RuntimeSettings {
  const prev = settings.ui.windowFrame;

  // Always remember position.  Only remember a "normal" size; the collapsed
  // header is intentionally not persisted as the next-launch window size.
  const next: WindowFrame = {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: frame.height >= 100 ? Math.max(240, Math.round(frame.width)) : prev.width,
    height: frame.height >= 100 ? Math.max(120, Math.round(frame.height)) : prev.height,
  };

  if (
    next.x !== prev.x ||
    next.y !== prev.y ||
    next.width !== prev.width ||
    next.height !== prev.height
  ) {
    settings.ui.windowFrame = next;
    save();
  }

  return getSettings();
}