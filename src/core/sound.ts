import { resolve, dirname, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

/**
 * หาไฟล์เสียงจากหลายที่ เพื่อให้ทำงานทั้งตอน `bun run` และตอนเป็น .exe standalone:
 *   1) โฟลเดอร์ที่ตัว exe อยู่ (สำคัญตอนดับเบิลคลิก .exe — sounds/ วางข้างๆ exe)
 *   2) โฟลเดอร์ปัจจุบัน (cwd) — ตอนรันด้วย bun run จาก root โปรเจกต์
 */
function resolveSound(soundPath: string): string | null {
  if (isAbsolute(soundPath) && existsSync(soundPath)) return soundPath;
  const bases = [dirname(process.execPath), process.cwd(), import.meta.dir, resolve(import.meta.dir, ".."), resolve(import.meta.dir, "../.."), resolve(import.meta.dir, "../../..")];
  for (const base of bases) {
    const p = resolve(base, soundPath);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * เล่นเสียงแบบ fire-and-forget (ไม่บล็อก loop จับ packet)
 * แต่ละครั้งเป็น process ของตัวเอง → เสียงซ้อนกันได้ไม่มีปัญหา
 *
 * Windows : ใช้ PowerShell
 *   - .wav      → System.Media.SoundPlayer (latency ต่ำ เล่นชัวร์)
 *   - อื่นๆ      → System.Windows.Media.MediaPlayer (mp3/wma ได้; ogg ต้องมี codec)
 * macOS   : afplay   |  Linux : paplay/aplay/ffplay  (ไว้เทสต์ตอน dev บนเครื่องที่ไม่ใช่ Windows)
 */
export function playSound(soundPath: string | null, volume: number = 1): void {
  if (!soundPath) return;
  const vol = Math.max(0, Math.min(1, volume));
  if (vol <= 0) return; // ปิดเสียง
  const abs = resolveSound(soundPath);
  if (!abs) {
    logger.warn(`Sound file not found: ${soundPath}`);
    return;
  }

  try {
    if (process.platform === "win32") return playWindows(abs, vol);
    if (process.platform === "darwin") return spawnDetached(["afplay", "-v", String(vol), abs]);
    return playLinux(abs);
  } catch (err) {
    logger.warn(`Sound playback failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function playWindows(abs: string, vol: number): void {
  const psPath = abs.replace(/'/g, "''"); // escape single-quote สำหรับ PowerShell
  const isWav = abs.toLowerCase().endsWith(".wav");
  // MediaPlayer เล่นได้ทั้ง wav + mp3/wma และปรับ volume ได้ (SoundPlayer ปรับ volume ไม่ได้)
  const mediaPlayer = [
    "Add-Type -AssemblyName presentationCore;",
    "$p = New-Object System.Windows.Media.MediaPlayer;",
    `$p.Open([uri]'${psPath}');`,
    `$p.Volume = ${vol.toFixed(3)};`,
    "$p.Play();",
    `Start-Sleep -Milliseconds ${config.nonWavPlayMs};`,
  ].join(" ");
  // .wav เต็มเสียง: SoundPlayer เร็วสุด | ลดเสียง/ไฟล์อื่น: MediaPlayer (ปรับ volume ได้)
  const script = isWav && vol >= 0.99
    ? `try { (New-Object System.Media.SoundPlayer '${psPath}').PlaySync() } catch { ${mediaPlayer} }`
    : mediaPlayer;

  spawnDetached(["powershell", "-NoProfile", "-NonInteractive", "-Command", script]);
}

function playLinux(abs: string): void {
  // ลองตามลำดับ; ตัวไหนมีในเครื่องก็ใช้ตัวนั้น
  for (const player of [["paplay", abs], ["aplay", abs], ["ffplay", "-nodisp", "-autoexit", abs]]) {
    if (Bun.which(player[0])) return spawnDetached(player);
  }
  logger.warn("No supported Linux audio player was found.");
}

function spawnDetached(cmd: string[]): void {
  // ไม่ await → ไม่บล็อกโปรแกรมหลัก
  Bun.spawn({ cmd, stdout: "ignore", stderr: "ignore", stdin: "ignore" });
}
