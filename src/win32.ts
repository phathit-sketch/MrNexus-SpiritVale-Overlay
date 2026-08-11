/**
 * win32 FFI helpers (Windows) — ใช้ .ptr จาก electrobun BrowserWindow
 *   - dpiAware()        : ข้อความคม (เรียกก่อนสร้างหน้าต่าง)
 *   - hideFromTaskbar() : ไม่โผล่ taskbar/Alt+Tab
 *   - setInteractive()  : ทำให้ "คลิก/ปรับได้ตลอด โดยไม่ต้องเป็น foreground และไม่แย่งโฟกัสเกม"
 *                         (WS_EX_NOACTIVATE + LAYERED, ไม่ TRANSPARENT = ไม่คลิกทะลุ)
 * ใช้เฉพาะ symbol ใน user32 -> dlopen ไม่พลาด
 */
import { dlopen, FFIType, type Pointer } from "bun:ffi";
import { logger } from "./core/logger.ts";

const GWL_EXSTYLE = -20;
const WS_EX_TRANSPARENT = 0x00000020;
const WS_EX_LAYERED = 0x00080000;
const WS_EX_NOACTIVATE = 0x08000000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const LWA_ALPHA = 0x2;
const SWP = 0x1 | 0x2 | 0x4 | 0x10 | 0x20; // NOSIZE|NOMOVE|NOZORDER|NOACTIVATE|FRAMECHANGED

let lib: any;
function u32() {
  if (!lib) {
    lib = dlopen("user32", {
      GetWindowLongPtrW: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i64 },
      SetWindowLongPtrW: { args: [FFIType.ptr, FFIType.i32, FFIType.i64], returns: FFIType.i64 },
      SetLayeredWindowAttributes: { args: [FFIType.ptr, FFIType.u32, FFIType.u8, FFIType.u32], returns: FFIType.bool },
      SetWindowPos: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.bool },
      SetProcessDpiAwarenessContext: { args: [FFIType.i64_fast], returns: FFIType.bool },
    }).symbols;
  }
  return lib;
}
function asHandle(p: unknown): Pointer | null { return (p as Pointer | null | undefined) ?? null; }
function getEx(h: Pointer): number { return Number(u32().GetWindowLongPtrW(h, GWL_EXSTYLE)) >>> 0; }
function setEx(h: Pointer, next: number): void {
  u32().SetWindowLongPtrW(h, GWL_EXSTYLE, BigInt(next >>> 0));
  u32().SetWindowPos(h, null, 0, 0, 0, 0, SWP);
}

export function dpiAware(): void {
  if (process.platform !== "win32") return;
  try { u32().SetProcessDpiAwarenessContext(-4n); } catch (e) { logger.warn(`Win32 dpiAware failed: ${String(e)}`); }
}

export function hideFromTaskbar(windowPtr: unknown): void {
  if (process.platform !== "win32") return;
  const h = asHandle(windowPtr); if (!h) return;
  try { setEx(h, (getEx(h) | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW); } catch (e) { logger.warn(`Win32 hideFromTaskbar failed: ${String(e)}`); }
}

/** คลิก/ปรับได้ตลอด โดยไม่แย่งโฟกัสเกม (NOACTIVATE + LAYERED, ไม่ TRANSPARENT) */
export function setInteractive(windowPtr: unknown): void {
  if (process.platform !== "win32") return;
  const h = asHandle(windowPtr); if (!h) return;
  try {
    const cur = getEx(h);
    const next = (cur | WS_EX_NOACTIVATE | WS_EX_LAYERED) & ~WS_EX_TRANSPARENT;
    if ((cur & WS_EX_LAYERED) === 0) u32().SetLayeredWindowAttributes(h, 0, 255, LWA_ALPHA);
    setEx(h, next);
  } catch (e) { logger.warn(`Win32 setInteractive failed: ${String(e)}`); }
}

/** opacity ทั้งหน้าต่าง (0-255) — ทั้งหน้าต่างโปร่งเท่ากัน แต่ยังคลิกได้ทุกจุด */
export function setWindowAlpha(windowPtr: unknown, alpha: number): void {
  if (process.platform !== "win32") return;
  const h = asHandle(windowPtr); if (!h) return;
  try { u32().SetLayeredWindowAttributes(h, 0, Math.max(20, Math.min(255, Math.round(alpha))), LWA_ALPHA); }
  catch (e) { logger.warn(`Win32 setWindowAlpha failed: ${String(e)}`); }
}