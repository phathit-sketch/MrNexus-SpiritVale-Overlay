/**
 * Capture core — จับแพ็กเก็ต -> classify -> กรองเฉพาะของเรา -> broadcast + เสียง
 *   ground (หล่นบนพื้น): ownerSteam เป็นหลัก; ถ้าไม่มี owner ใช้ recent local-kill evidence
 *   pickup (เก็บได้):   ของเราเอง -> โชว์ overlay อย่างเดียว (ไม่มีเสียง)
 */
import { getNpcapStatus, PacketCapture } from "@kar-mi/spirit-vale-tools-capture/capture";
import { FishNetActorDirectory, FishNetCombatTracker } from "@kar-mi/spirit-vale-tools-combat";
import { FishNetMobRewardTracker, mobDefinitionsById } from "@kar-mi/spirit-vale-tools-rewards";
import { config } from "./config.ts";
import { classifyItem } from "./classify.ts";
import { playSound } from "./sound.ts";
import { ITEM_INDEX } from "./item-index.ts";
import { getActiveProfile, resolveSoundPackOverride, type SoundFilterKey } from "./runtime-config.ts";
import { LocalKillTracker } from "./kill-tracker.ts";
import { LocalRewardCorrelator } from "./reward-correlator.ts";

let ownOnly = getActiveProfile().ownOnly;
let volume = getActiveProfile().volume;

export function setOwnOnly(v: boolean): void { ownOnly = v; }
export function setVolume(v: number): void { volume = Math.max(0, Math.min(1, v)); }

export function refreshRuntimeProfile(): void {
  const p = getActiveProfile();
  ownOnly = p.ownOnly;
  volume = p.volume;
}

function soundEnabled(sound: string): boolean {
  const p = getActiveProfile();
  return p.enabledSounds[sound as SoundFilterKey] ?? true;
}

function soundPath(sound: string): string | null {
  const key = sound as SoundFilterKey;
  return resolveSoundPackOverride(key) ?? config.sounds[key as keyof typeof config.sounds] ?? null;
}

// ---------- Grind tracker (เงิน/เวลา จากการฆ่ามอน) ----------
let broadcastFn: ((e: unknown) => void) | null = null;
let grinding = false;
let grindStartMs = 0;
let grindDurationMs = 0; // 0 = ไม่จำกัดเวลา
let grindCoins = 0;
let grindKills = 0;
let grindExp = 0;

function grindSnapshot() {
  return { type: "grind", running: grinding, startMs: grindStartMs, durationMs: grindDurationMs, coins: grindCoins, kills: grindKills, exp: grindExp };
}
function pushGrind(): void { try { broadcastFn?.(grindSnapshot()); } catch {} }

export function startGrind(durationMin: number): void {
  grinding = true; grindStartMs = Date.now();
  grindDurationMs = Math.max(0, durationMin || 0) * 60000;
  grindCoins = 0; grindKills = 0; grindExp = 0;
  pushGrind();
}
export function stopGrind(): void { grinding = false; pushGrind(); }
export function grindStatus(): unknown { return grindSnapshot(); }

export type FeedEvent = { side: "ground" | "pickup"; sound: string; name: string; ts: number };

const ID_TO_NAME: Record<string, string> = {};
for (const [dn, v] of Object.entries(ITEM_INDEX)) if (!(v.id in ID_TO_NAME)) ID_TO_NAME[v.id] = dn.replace(/\b\w/g, (c) => c.toUpperCase());

// SteamID เป็น confirmation/veto เสริม ไม่ใช่ local identity หลัก
// local identity หลักมาจาก LoadCharacter_S GUID + combat actor
// mySteam จะ auto-learn จาก local pickup เมื่อมี ground candidate + confirmed local kill ใกล้กัน
const recentGroundOwner = new Map<string, { owner: string | null; ts: number }>(); // ชื่อไอเทม(lowercase) -> owner ล่าสุด
let mySteam: string | null = null;
// Release build: packet-level diagnostics are disabled.
const DEBUG_CAPTURE = false;
const VERIFY_LOG = DEBUG_CAPTURE;
let localCharacterGuid: string | null = null;
const GROUND_DIAG = DEBUG_CAPTURE;

function resetLocalSessionState(): void {
  localActorId = null;
  localOwnerConnectionId = null;
  localIdentity = null;
  mySteam = null;
  recentGroundOwner.clear();
  seen.clear();
  monsterNames.clear();
  deathCountByActor.clear();
  killTracker.resetSessionIdentity();
  rewardCorrelator.reset();
}
   // log เฉพาะ rare ground drop เพื่อไล่ ownership

// Unified local-kill evidence for Grind + ground-drop correlation.
const killTracker = new LocalKillTracker({
  acceptConfidence: 80,
  correlationWindowMs: 3000,
  keepMs: 6000,
});

const rewardCorrelator = new LocalRewardCorrelator({
  correlationWindowMs: 3500,
  keepMs: 8000,
});

function recentLocalKillEvidence(now = Date.now()) {
  return killTracker.recent(now);
}

function packetPayloadBuffer(packet: any): Buffer | null {
  if (Buffer.isBuffer(packet?.payload)) return packet.payload;
  return null;
}

function extractUuid(buf: Buffer | null): string | null {
  if (!buf) return null;
  const text = buf.toString("latin1");
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return m?.[0] ?? null;
}

function rememberGround(name: string, owner: string | null): void {
  recentGroundOwner.set(name.toLowerCase(), { owner, ts: Date.now() });
  if (recentGroundOwner.size > 300) { const k = recentGroundOwner.keys().next().value; if (k) recentGroundOwner.delete(k); }
}
function learnFromPickup(name: string): void {
  if (mySteam) return;

  const now = Date.now();
  const g = recentGroundOwner.get(name.toLowerCase()); // ground/pickup id อาจไม่ตรงกัน จึงเทียบชื่อ
  const killEvidence = recentLocalKillEvidence(now);

  // Pickup เป็น local client แน่นอน แต่ชื่อไอเทมอาจชนกับของคนอื่นได้
  // จึงเรียนรู้ mySteam เฉพาะ candidate ground ที่ใหม่มาก + มี confirmed local kill ใกล้ ๆ
  if (g && g.owner && now - g.ts < 5000 && killEvidence.matched) {
    mySteam = g.owner;
    if (DEBUG_CAPTURE) console.log(`[identity] local SteamID linked`);
  }
}

type OwnershipReason =
  | "steam-match"
  | "steam-other"
  | "recent-local-kill"
  | "no-evidence";

function ownershipDecision(owner: string | null, now = Date.now()): {
  mine: boolean;
  reason: OwnershipReason;
  killCount: number;
  nearestKillMs: number | null;
  nearestKillTick: number | null;
  nearestTargetId: number | null;
} {
  const ev = recentLocalKillEvidence(now);

  // ถ้ารู้ mySteam แล้ว owner field เป็น source of truth:
  // owner ต่าง = veto ทันที แม้เราเพิ่งฆ่ามอนอยู่ก็ตาม
  if (owner && mySteam) {
    return {
      mine: owner === mySteam,
      reason: owner === mySteam ? "steam-match" : "steam-other",
      killCount: ev.count,
      nearestKillMs: ev.nearestMs,
      nearestKillTick: ev.nearestTick,
      nearestTargetId: ev.nearestTargetId,
    };
  }

  // ownerSteam ไม่มี: ใช้ confirmed local-kill correlation เป็น fallback
  if (!owner && ev.matched && localCharacterGuid != null) {
    return {
      mine: true,
      reason: "recent-local-kill",
      killCount: ev.count,
      nearestKillMs: ev.nearestMs,
      nearestKillTick: ev.nearestTick,
      nearestTargetId: ev.nearestTargetId,
    };
  }

  return {
    mine: false,
    reason: "no-evidence",
    killCount: ev.count,
    nearestKillMs: ev.nearestMs,
    nearestKillTick: ev.nearestTick,
    nearestTargetId: ev.nearestTargetId,
  };
}


function printable(b: Buffer, s: number, e: number): boolean { for (let j = s; j < e; j++) { const c = b[j]; if (c < 0x20 || c > 0x7e) return false; } return true; }

/** <lenName*2><name><lenIcon*2><icon> ; owner = steamID ในแพ็กเก็ต (ถ้ามี = ของคนอื่น) */
function findItem(buf: Buffer): { name: string; id: string; category: string; owner: string | null } | null {
  for (let i = 0; i < buf.length - 1; i++) {
    const L = buf[i];
    if (L < 6 || L > 80 || L % 2) continue;
    const n = L >> 1, ns = i + 1, ne = i + 1 + n;
    if (ne > buf.length || !printable(buf, ns, ne)) continue;
    const name = buf.toString("latin1", ns, ne);
    const hit = ITEM_INDEX[name.toLowerCase()];
    if (!hit) continue;
    const Li = buf[ne];
    if (Li === undefined || Li < 2 || Li > 80 || Li % 2) continue;
    const m = Li >> 1, is = ne + 1, ie = ne + 1 + m;
    if (ie > buf.length || !printable(buf, is, ie)) continue;
    if (/\s/.test(buf.toString("latin1", is, ie))) continue;
    const owner = (buf.toString("latin1", 0, ns).match(/(765611\d{11})/) || [])[1] ?? null; // owner = steamID ก่อนชื่อ (ของเรา = ไม่มี)
    return { name, id: hit.id, category: hit.category, owner };
  }
  return null;
}

/** เริ่มจับแพ็กเก็ต; เรียก broadcast(evt) ทุกครั้งที่มีของเข้าเงื่อนไข */
export async function startCapture(broadcast: (e: FeedEvent) => void): Promise<PacketCapture> {
  broadcastFn = broadcast as (e: unknown) => void; // ให้ grind ใช้ broadcast เดียวกัน
  const status = await getNpcapStatus();
  if (status.availability !== "ready") throw new Error("Npcap ยังไม่พร้อม (" + status.availability + ") — ติดตั้งจาก https://npcap.com");

  const tracker = new FishNetMobRewardTracker();

  // Combat tracker + actor directory
  // Local identity หลักจะเรียนรู้จาก LoadCharacter_S GUID โดยตรง ไม่ hardcode ชื่อตัวละคร
  let localIdentity: { displayName: string; uid?: string; archetype?: number } | null = null;

  const actorDirectory = new FishNetActorDirectory({
    onLocalIdentity(identity) {
      localIdentity = identity;
    },
  });

  const combatTracker = new FishNetCombatTracker({
    monsterCatalog: mobDefinitionsById(),
    actorIdentityResolver(actorId) {
      return actorDirectory.getAttribution(actorId);
    },
  });
  const monsterNames = new Map<number, string>();
  const deathCountByActor = new Map<number, number>();

  // Local combat identity: actorId/ownerConnectionId เปลี่ยนได้ทุก session/map
  // เรียนรู้ actorId ใหม่จาก LoadCharacter_S โดยใช้ Character GUID เป็น identity หลัก
  let localActorId: number | null = null;
  let localOwnerConnectionId: number | null = null;

  const capture = new PacketCapture();
  const seen = new Map<number, number>();
  const DEDUPE = 600;

  capture.on("fishNetPacket", (packet: any) => {
    // (0) Identity directory ต้องกิน packet ก่อน combat tracker
    for (const iev of actorDirectory.consume(packet)) {
      if (
        iev.kind === "actorIdentity" &&
        iev.operation === "upsert" &&
        localActorId != null &&
        iev.actorId === localActorId &&
        iev.ownerConnectionId != null
      ) {
        localOwnerConnectionId = iev.ownerConnectionId;
        killTracker.setLocalOwner(localOwnerConnectionId);
      }
    }

    // Stable local character identity:
    // LoadCharacter_S มี Character GUID ที่คงเดิมข้าม actorId / ownerConnectionId
    // objectId ของ packet นี้คือ local player object ใน session/map ปัจจุบัน
    if (packet?.packetName === "serverRpc" && packet?.rpcName === "LoadCharacter_S") {
      const payload = packetPayloadBuffer(packet);
      const guid = extractUuid(payload);

      if (guid) {
        const actorChanged = localActorId !== packet.objectId;
        const guidChanged = localCharacterGuid != null && localCharacterGuid !== guid;

        if (guidChanged) {
          resetLocalSessionState();
        }

        localCharacterGuid = guid;
        if (packet.objectId != null) localActorId = packet.objectId;

        const attr = localActorId != null
          ? actorDirectory.getAttribution(localActorId)
          : undefined;

        if (attr?.ownerConnectionId != null) {
          localOwnerConnectionId = attr.ownerConnectionId;
        } else if (actorChanged) {
          // owner ของ actor ใหม่อาจยัง resolve ไม่ทัน
          localOwnerConnectionId = null;
        }

        killTracker.setLocalIdentity({
          actorId: localActorId,
          ownerConnectionId: localOwnerConnectionId,
          uid: localIdentity?.uid ?? null,
        });

        if (DEBUG_CAPTURE && (actorChanged || guidChanged)) {
          console.log(
            `[local] session=${guidChanged ? "changed" : "bound"} actor=${localActorId ?? "?"} owner=${localOwnerConnectionId ?? "?"}`
          );
        }
      }
    }

    // (0.1) Combat events — นับเฉพาะ death ที่ attacker identity ตรงกับ local player
    for (const cev of combatTracker.consume(packet)) {
      if (cev.kind === "monsterIdentity") {
        if (cev.operation === "upsert") monsterNames.set(cev.actorId, cev.displayName);
        else if (cev.operation === "remove") monsterNames.delete(cev.actorId);
        else if (cev.operation === "reset") monsterNames.clear();
        continue;
      }

      if (cev.kind === "death") {
        const n = (deathCountByActor.get(cev.actorId) ?? 0) + 1;
        deathCountByActor.set(cev.actorId, n);
        const mob = monsterNames.get(cev.targetId) ?? "?";

        // Combat attacker IDs บางครั้งเป็น object คนละตัวกับ object ที่ถือ CharacterData/VisualData
        // บอก directory ว่านี่คือ player attacker เพื่อให้มัน propagate identity ผ่าน ownerConnectionId
        if (cev.team === 0 && cev.actorId > 0) {
          for (const iev of actorDirectory.observePlayerActor(cev.actorId, cev.tick)) {
            if (VERIFY_LOG && iev.kind === "actorIdentity" && iev.operation === "upsert") {
              console.log(
                `[actor-link] id=${iev.actorId} name=${JSON.stringify(iev.displayName)} uid=${iev.uid ?? "?"} owner=${iev.ownerConnectionId ?? "?"}`
              );
            }
          }
        }

        const identity = actorDirectory.getAttribution(cev.actorId);

        // ถ้า combat actor ถูก resolve เพิ่มทีหลัง ให้เก็บ owner ของ local actor ไว้ด้วย
        if (localActorId != null && cev.actorId === localActorId && identity?.ownerConnectionId != null) {
          localOwnerConnectionId = identity.ownerConnectionId;
          killTracker.setLocalOwner(localOwnerConnectionId);
        }

        if (localIdentity?.uid) {
          killTracker.setLocalUid(localIdentity.uid);
        }

        // One source of truth for kill ownership.
        // Conservative confidence only: actorId > ownerConnectionId > UID.
        const killEvidence = killTracker.acceptDeath(
          {
            tick: cev.tick,
            actorId: cev.actorId,
            targetId: cev.targetId,
            team: cev.team,
            value: cev.value,
            sourceLabel: cev.sourceLabel,
            isClone: cev.isClone,
            isSummon: cev.isSummon,
          },
          {
            ownerConnectionId: identity?.ownerConnectionId ?? null,
            uid: identity?.uid ?? null,
          },
        );

        const isMe = !!killEvidence;

        if (killEvidence) {
          rewardCorrelator.recordKill(killEvidence);

          if (grinding) {
            grindKills += 1;
            pushGrind();
          }
        }

        if (VERIFY_LOG) {
          console.log(
            `[death] tick=${cev.tick} actor=${cev.actorId} name=${JSON.stringify(identity?.displayName ?? "?")} ` +
            `uid=${identity?.uid ?? "?"} ME=${isMe} conf=${killEvidence?.confidence ?? 0} reason=${killEvidence?.reason ?? "-"} ` +
            `actorDeaths=${n} target=${cev.targetId} mob=${JSON.stringify(mob)} ` +
            `source=${JSON.stringify(cev.sourceLabel)} value=${cev.value} team=${cev.team} attr=${cev.attribution} ` +
            `dup=${cev.duplicatesDamageEvent} clone=${cev.isClone} summon=${cev.isSummon}`
          );
        }
      }
    }

    // (1) หล่นบนพื้น — syncType ; เฉพาะของเรา -> มีเสียง
    if (packet?.packetName === "syncType" && Buffer.isBuffer(packet.raw)) {
      const item = findItem(packet.raw);
      if (item) {
        const oid = packet.objectId ?? -1, last = seen.get(oid);
        if (last === undefined || packet.tick - last >= DEDUPE) {
          seen.set(oid, packet.tick);
          if (seen.size > 500) { for (const k of seen.keys()) { seen.delete(k); if (seen.size <= 300) break; } }
          const sound = classifyItem({ category: item.category as any, itemId: item.id, count: 1 });
          rememberGround(item.name, item.owner); // ใช้สำหรับ auto-learn mySteam จาก pickup
          const ownership = ownershipDecision(item.owner);
          const mine = ownership.mine;

          if (sound && soundEnabled(sound)) {
            if (!ownOnly) {
              // ผู้ใช้เลือกฟังทุก drop
              broadcast({ side: "ground", sound, name: item.name, ts: Date.now() });
              playSound(soundPath(sound), volume);
            } else if (!mySteam) {
              // Startup mode:
              // ก่อนรู้ SteamID ของ local player ให้เล่น rare ทุกชิ้นที่จับได้
              // เพื่อไม่พลาดเสียงของตัวเองช่วงเริ่มเกม
              broadcast({ side: "ground", sound, name: item.name, ts: Date.now() });
              playSound(soundPath(sound), volume);
            } else if (mine) {
              // หลังรู้ mySteam แล้ว lock เฉพาะของเรา
              broadcast({ side: "ground", sound, name: item.name, ts: Date.now() });
              playSound(soundPath(sound), volume);
            }
          }
        }
      }
    }
    // (2) Reward/pickup — local client.
    //
    // Important: FishNetMobRewardTracker can emit multiple semantic events for
    // one underlying reward packet. Batch them first so EXP/coins are accounted
    // exactly once per packet, while pickup/drop events are still processed
    // individually below.
    const rewardEvents = [...tracker.consume(packet)] as any[];

    if (rewardEvents.length) {
      if (VERIFY_LOG) {
        for (const ev of rewardEvents) {
          if ((ev as any).kind === "kill") {
            console.log(
              `[reward-kill] mob=${(ev as any).mob?.displayName ?? "?"} ` +
              `attr=${(ev as any).attributed} ` +
              `exp=${(ev as any).experience ?? 0} ` +
              `jobExp=${(ev as any).jobExperience ?? 0} ` +
              `coins=${String((ev as any).coins ?? 0)} ` +
              `drops=${((ev as any).drops || []).length}`
            );
          } else if ((ev as any).kind === "unmatched") {
            console.log(
              `[reward-unmatched] reason=${(ev as any).reason ?? "?"} ` +
              `reward=${String((ev as any).reward ?? "?")} ` +
              `exp=${(ev as any).experience ?? 0} ` +
              `jobExp=${(ev as any).jobExperience ?? 0} ` +
              `coins=${String((ev as any).coins ?? 0)} ` +
              `drops=${((ev as any).drops || []).length}`
            );
          } else {
            console.log(`[reward-other] kind=${String((ev as any).kind ?? "?")} data=${JSON.stringify(ev)}`);
          }
        }
      }

      const rewardBatch = rewardCorrelator.consumePacket(rewardEvents);

      // Kill count comes from confirmed local death evidence.
      // EXP/coins come from the actual local-client reward packet, deduplicated
      // across overlapping semantic tracker events.
      if (grinding) {
        if (grindDurationMs > 0 && Date.now() - grindStartMs >= grindDurationMs) {
          grinding = false;
          pushGrind();
        } else if (rewardBatch.coins || rewardBatch.exp) {
          grindCoins += rewardBatch.coins;
          grindExp += rewardBatch.exp;

          if (VERIFY_LOG) {
            console.log(
              `[reward-batch] +exp=${rewardBatch.exp} +coins=${rewardBatch.coins} ` +
              `events=${rewardBatch.eventCount} walletEvents=${rewardBatch.rewardEventCount} ` +
              `deduped=${rewardBatch.duplicateEventsDropped} ` +
              `matchedKills=${rewardBatch.matchedKillCount} ` +
              `pendingKills=${rewardCorrelator.pendingCount()} ` +
              `totalExp=${grindExp} totalCoins=${grindCoins}`
            );
          }

          pushGrind();
        }
      }

      // Pickups are local-client events; retain them independently from wallet
      // accounting so Steam-link learning and rare pickup feed still work.
      for (const ev of rewardEvents) {
        const drops = Array.isArray((ev as any).drops) ? (ev as any).drops : [];

        for (const d of drops) {
          const nm = ID_TO_NAME[d.itemId] || d.itemId;
          learnFromPickup(nm);
          const sound = classifyItem({ category: d.category, itemId: d.itemId, count: 1 });
          if (!sound || !soundEnabled(sound)) continue;
          broadcast({ side: "pickup", sound, name: nm, ts: Date.now() });
        }
      }
    }
  });

  await capture.start({ protocols: ["udp"], targetProcessName: config.targetProcessName, decodeFishNet: true });
  return capture;
}