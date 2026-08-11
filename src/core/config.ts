import type { RewardItemCategory } from "@kar-mi/spirit-vale-tools-rewards";
import { BOSS_CARDS, BOSS_GEMS } from "./boss-items.ts";

/**
 * =====================================================================
 *  แก้ไฟล์นี้ที่เดียวจบ — เหมือนเขียน loot filter ของ PoE
 * =====================================================================
 *
 *  ทุกครั้งที่ของดรอป เราได้ข้อมูล: category / itemId (ชื่อภายในเกม) / count
 *  กฎด้านล่างไล่จากบนลงล่าง "อันแรกที่ match ชนะ"
 *    sound: "ชื่อคีย์เสียง"  -> เล่นเสียงนั้น
 *    sound: null            -> match แล้วเงียบ (ไม่เล่น และไม่ตกไปกฎถัดไป)
 *    ของที่ไม่เข้ากฎไหนเลย   -> เงียบ
 */

/** คีย์เสียง -> ไฟล์ (path เทียบจากโฟลเดอร์โปรเจกต์). ชื่อไฟล์ต้องตรงกับที่วางใน sounds/ */
const SOUNDS = {
  lure_boss:   "sounds/lure_boss.wav",
  eggs:        "sounds/eggs.wav",
  card_boss:   "sounds/card_boss.mp3",
  card_normal: "sounds/card_normal.wav",
  gem_boss:    "sounds/gem_boss.mp3",
  gem_normal:  "sounds/gem_normal.wav",
  essence:     "sounds/essence.wav",   // <- วางไฟล์เสียง essence เอง (หรือชี้ไปไฟล์เดิมก็ได้)
};
export type SoundKey = keyof typeof SOUNDS;

export interface SoundRule {
  sound: SoundKey | null;
  categories?: RewardItemCategory[];
  itemIds?: string[];            // match ตรงตัว (ตัวเล็ก/ใหญ่ไม่สน)
  itemIdStartsWith?: string[];   // match ตามคำขึ้นต้น
  itemIdContains?: string[];     // match ถ้าชื่อมีคำนี้อยู่
}

export const config = {
  /** ชื่อ process ของเกม (ดูใน Task Manager > Details ถ้าไม่ตรง) */
  targetProcessName: "SpiritVale.exe",

  sounds: SOUNDS,

  /** กฎ — บนลงล่าง อันแรกที่ match ชนะ */
  rules: [
    // ---------- consumable ----------
    { sound: null,        categories: ["consumable"], itemIds: ["Artifact Box Base"] },                   // "Box of Origins" = เงียบ
    { sound: "eggs",      categories: ["consumable"], itemIds: ["Mystery Mount Box", "Mystery Pet Box"] }, // egg เมาท์/เพ็ท
    { sound: "lure_boss", categories: ["consumable"], itemIdStartsWith: ["Lure "] },                       // ไอเทมเรียกบอส (ขึ้นต้น "Lure ")

    // ---------- card ----------
    { sound: "card_boss",   categories: ["card"], itemIds: BOSS_CARDS }, // การ์ดมอนบอส (33 ใบ)
    { sound: "card_normal", categories: ["card"] },                      // การ์ดที่เหลือ = ปกติ

    // ---------- gem ----------
    { sound: "gem_boss",   categories: ["gem"], itemIds: BOSS_GEMS },    // gem บอส/สเตตัส (36 ชิ้น)
    { sound: "gem_normal", categories: ["gem"] },                        // gem ที่เหลือ = skill gem

    // ---------- essence (material, ~0.1%) ----------
    { sound: "essence", itemIdContains: ["Essence"] }, // Essence of Growth/Chaos/... + Random Essence

    // ของหมวดอื่น (equipment/artifact/material/currency/cosmetic) = เงียบ
  ] satisfies SoundRule[],

  /**
   * ต่อ 1 kill/pickup มักมีของหลายชิ้น
   *  "highest" = เล่นเสียงเดียว เลือกตาม priority ด้านล่าง (แนะนำ)
   *  "each"    = เล่นทุกชิ้นที่เข้ากฎ
   */
  playMode: "highest" as "highest" | "each",

  /** ลำดับความสำคัญเวลา playMode = "highest" (ซ้ายสุด = สำคัญสุด) */
  priority: ["lure_boss", "card_boss", "gem_boss", "eggs", "essence", "card_normal", "gem_normal"] as SoundKey[],

  /** พิมพ์ log ทุกดรอปที่ trigger ลง console ไหม */
  announceInConsole: true,

  /** เวลาเล่นไฟล์ที่ไม่ใช่ .wav เช่น .mp3 (ms) */
  nonWavPlayMs: 5000,
};