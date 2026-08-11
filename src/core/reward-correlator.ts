/**
 * Reward correlation for local combat.
 *
 * FishNetMobRewardTracker may emit more than one semantic event for the same
 * underlying reward packet (for example an attributed kill event plus an
 * unmatched/ambiguous event carrying the same EXP/coins).
 *
 * This module:
 *   1) keeps a short queue of confirmed local kills;
 *   2) batches reward events per FishNet packet;
 *   3) removes obvious cross-kind duplicates;
 *   4) produces one wallet delta (EXP/coins) per packet;
 *   5) correlates that delta to recent confirmed local kills for diagnostics.
 *
 * It intentionally does NOT invent EXP/coins from monster definitions.
 */

import type { KillEvidence } from "./kill-tracker.ts";

export type RewardEventLike = {
  kind?: string;
  attributed?: boolean;
  reason?: string;
  experience?: number;
  jobExperience?: number;
  coins?: number | string | bigint;
  drops?: unknown[];
};

export type RewardDelta = {
  exp: number;
  jobExp: number;
  coins: number;
};

export type RewardBatchResult = RewardDelta & {
  eventCount: number;
  rewardEventCount: number;
  matchedKillCount: number;
  matchedKillTicks: number[];
  duplicateEventsDropped: number;
};

type PendingKill = KillEvidence & {
  consumedByReward: boolean;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function deltaOf(ev: RewardEventLike): RewardDelta {
  return {
    exp: num(ev.experience),
    jobExp: num(ev.jobExperience),
    coins: num(ev.coins),
  };
}

function nonZero(d: RewardDelta): boolean {
  return d.exp !== 0 || d.jobExp !== 0 || d.coins !== 0;
}

function signature(d: RewardDelta): string {
  return `${d.exp}|${d.jobExp}|${d.coins}`;
}

function add(a: RewardDelta, b: RewardDelta): RewardDelta {
  return {
    exp: a.exp + b.exp,
    jobExp: a.jobExp + b.jobExp,
    coins: a.coins + b.coins,
  };
}

export class LocalRewardCorrelator {
  private readonly pendingKills: PendingKill[] = [];

  constructor(
    private readonly opts: {
      correlationWindowMs?: number;
      keepMs?: number;
    } = {},
  ) {}

  recordKill(kill: KillEvidence): void {
    this.prune(kill.at);
    this.pendingKills.push({ ...kill, consumedByReward: false });
  }

  /**
   * Process every reward semantic event emitted for ONE FishNet packet.
   *
   * Cross-kind duplicate rule:
   * If a "kill" event and an "unmatched" event carry the exact same
   * EXP/jobEXP/coins tuple in the same packet, count that tuple once.
   *
   * Events of the same kind are never deduplicated merely because their
   * values are equal; two same-value monster rewards may be legitimate.
   */
  consumePacket(events: RewardEventLike[], now = Date.now()): RewardBatchResult {
    this.prune(now);

    const monetary = events
      .map((ev, index) => ({ ev, index, delta: deltaOf(ev) }))
      .filter((x) => nonZero(x.delta));

    const dropped = new Set<number>();

    // Multiset-match exact duplicate wallet deltas across kill <-> unmatched.
    const killBySig = new Map<string, number[]>();
    const unmatchedBySig = new Map<string, number[]>();

    for (const x of monetary) {
      const kind = String(x.ev.kind ?? "");
      const sig = signature(x.delta);
      const map =
        kind === "kill" ? killBySig :
        kind === "unmatched" ? unmatchedBySig :
        null;
      if (!map) continue;
      const arr = map.get(sig) ?? [];
      arr.push(x.index);
      map.set(sig, arr);
    }

    let duplicateEventsDropped = 0;
    for (const [sig, killIndexes] of killBySig) {
      const unmatchedIndexes = unmatchedBySig.get(sig);
      if (!unmatchedIndexes?.length) continue;

      const pairs = Math.min(killIndexes.length, unmatchedIndexes.length);
      // Keep the attributed/matched "kill" semantic event and suppress the
      // corresponding unmatched duplicate for wallet accounting.
      for (let i = 0; i < pairs; i++) {
        dropped.add(unmatchedIndexes[i]);
        duplicateEventsDropped++;
      }
    }

    let total: RewardDelta = { exp: 0, jobExp: 0, coins: 0 };
    let rewardEventCount = 0;

    for (const x of monetary) {
      if (dropped.has(x.index)) continue;
      total = add(total, x.delta);
      rewardEventCount++;
    }

    // Attach one reward batch to all still-unconsumed local kills in the
    // correlation window. Spirit Vale often aggregates several kills into one
    // EXP/coin packet, so forcing one reward -> one kill would be incorrect.
    const windowMs = this.opts.correlationWindowMs ?? 3500;
    const matched = this.pendingKills.filter(
      (k) => !k.consumedByReward && now - k.at >= 0 && now - k.at <= windowMs,
    );

    if (nonZero(total)) {
      for (const k of matched) k.consumedByReward = true;
    }

    return {
      ...total,
      eventCount: events.length,
      rewardEventCount,
      matchedKillCount: nonZero(total) ? matched.length : 0,
      matchedKillTicks: nonZero(total) ? matched.map((k) => k.tick) : [],
      duplicateEventsDropped,
    };
  }

  pendingCount(now = Date.now()): number {
    this.prune(now);
    return this.pendingKills.filter((k) => !k.consumedByReward).length;
  }

  reset(): void {
    this.pendingKills.length = 0;
  }

  private prune(now = Date.now()): void {
    const keepMs = this.opts.keepMs ?? 8000;
    while (this.pendingKills.length && now - this.pendingKills[0].at > keepMs) {
      this.pendingKills.shift();
    }
  }
}