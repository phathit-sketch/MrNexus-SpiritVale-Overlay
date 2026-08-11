import type { RewardItem } from "@kar-mi/spirit-vale-tools-rewards";
import { config, type SoundKey, type SoundRule } from "./config.ts";

function ruleMatches(rule: SoundRule, item: RewardItem): boolean {
  if (rule.categories && !rule.categories.includes(item.category)) return false;

  const id = item.itemId.toLowerCase();
  if (rule.itemIds && !rule.itemIds.some((x) => x.toLowerCase() === id)) return false;
  if (rule.itemIdStartsWith && !rule.itemIdStartsWith.some((p) => id.startsWith(p.toLowerCase()))) return false;
  if (rule.itemIdContains && !rule.itemIdContains.some((s) => id.includes(s.toLowerCase()))) return false;

  // ต้องมีเงื่อนไขอย่างน้อยหนึ่งอย่าง (กันกฎว่างเปล่า match ทุกอย่าง)
  return Boolean(rule.categories || rule.itemIds || rule.itemIdStartsWith || rule.itemIdContains);
}

/**
 * คืนค่า:
 *   SoundKey   -> เล่นเสียงคีย์นี้
 *   null       -> match กฎแต่ตั้งใจให้เงียบ (เช่น Box of Origins)
 *   undefined  -> ไม่เข้ากฎไหนเลย
 */
export function classifyItem(item: RewardItem): SoundKey | null | undefined {
  for (const rule of config.rules) {
    if (ruleMatches(rule, item)) return rule.sound;
  }
  return undefined;
}
