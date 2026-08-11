/**
 * Local kill attribution engine.
 *
 * Source of truth hierarchy (conservative; no skill-name / burst guessing):
 *   100 = attacker actorId is the current local actor
 *    90 = attacker resolves to the current local ownerConnectionId
 *    80 = attacker UID matches the current local UID
 *
 * A death is considered a local kill only when confidence >= threshold.
 * The same accepted evidence is also retained briefly for ground-drop correlation.
 */

export type LocalIdentityState = {
  actorId: number | null;
  ownerConnectionId: number | null;
  uid: string | null;
};

export type ActorIdentityLike = {
  ownerConnectionId?: number | null;
  uid?: string | null;
};

export type DeathLike = {
  tick: number;
  actorId: number;
  targetId: number;
  team: number;
  value: number;
  sourceLabel?: string | null;
  isClone?: boolean;
  isSummon?: boolean;
};

export type KillEvidence = {
  at: number;
  tick: number;
  actorId: number;
  targetId: number;
  source: string;
  confidence: number;
  reason: "local-actor" | "local-owner" | "local-uid";
  ownerConnectionId: number | null;
  uid: string | null;
};

export type RecentKillEvidence = {
  matched: boolean;
  count: number;
  nearestMs: number | null;
  nearestTick: number | null;
  nearestTargetId: number | null;
  highestConfidence: number | null;
};

export class LocalKillTracker {
  private local: LocalIdentityState = {
    actorId: null,
    ownerConnectionId: null,
    uid: null,
  };

  private readonly kills: KillEvidence[] = [];

  constructor(
    private readonly opts: {
      acceptConfidence?: number;
      correlationWindowMs?: number;
      keepMs?: number;
    } = {},
  ) {}

  get state(): Readonly<LocalIdentityState> {
    return this.local;
  }

  setLocalActor(actorId: number | null): void {
    this.local.actorId = actorId;
  }

  setLocalOwner(ownerConnectionId: number | null): void {
    this.local.ownerConnectionId = ownerConnectionId;
  }

  setLocalUid(uid: string | null): void {
    this.local.uid = uid;
  }

  setLocalIdentity(next: Partial<LocalIdentityState>): void {
    if ("actorId" in next) this.local.actorId = next.actorId ?? null;
    if ("ownerConnectionId" in next) this.local.ownerConnectionId = next.ownerConnectionId ?? null;
    if ("uid" in next) this.local.uid = next.uid ?? null;
  }

  /**
   * Score one death. This intentionally does NOT infer ownership from
   * skill names, nearby deaths, timing bursts, clone flags, etc.
   */
  scoreDeath(death: DeathLike, identity?: ActorIdentityLike): KillEvidence | null {
    if (
      death.team !== 0 ||
      death.actorId <= 0 ||
      death.actorId === death.targetId ||
      death.value <= 0
    ) {
      return null;
    }

    let confidence = 0;
    let reason: KillEvidence["reason"] | null = null;

    if (this.local.actorId != null && death.actorId === this.local.actorId) {
      confidence = 100;
      reason = "local-actor";
    } else if (
      this.local.ownerConnectionId != null &&
      identity?.ownerConnectionId != null &&
      identity.ownerConnectionId === this.local.ownerConnectionId
    ) {
      confidence = 90;
      reason = "local-owner";
    } else if (
      this.local.uid &&
      identity?.uid &&
      identity.uid === this.local.uid
    ) {
      confidence = 80;
      reason = "local-uid";
    }

    if (!reason || confidence < (this.opts.acceptConfidence ?? 80)) {
      return null;
    }

    return {
      at: Date.now(),
      tick: death.tick,
      actorId: death.actorId,
      targetId: death.targetId,
      source: death.sourceLabel ?? "unknown",
      confidence,
      reason,
      ownerConnectionId: identity?.ownerConnectionId ?? null,
      uid: identity?.uid ?? null,
    };
  }

  acceptDeath(death: DeathLike, identity?: ActorIdentityLike): KillEvidence | null {
    const evidence = this.scoreDeath(death, identity);
    if (!evidence) return null;

    this.prune(evidence.at);
    this.kills.push(evidence);
    return evidence;
  }

  recent(now = Date.now()): RecentKillEvidence {
    this.prune(now);
    const windowMs = this.opts.correlationWindowMs ?? 3000;
    const recent = this.kills.filter((k) => now - k.at <= windowMs);

    if (!recent.length) {
      return {
        matched: false,
        count: 0,
        nearestMs: null,
        nearestTick: null,
        nearestTargetId: null,
        highestConfidence: null,
      };
    }

    const nearest = recent[recent.length - 1];
    let highestConfidence = 0;
    for (const k of recent) highestConfidence = Math.max(highestConfidence, k.confidence);

    return {
      matched: true,
      count: recent.length,
      nearestMs: Math.max(0, now - nearest.at),
      nearestTick: nearest.tick,
      nearestTargetId: nearest.targetId,
      highestConfidence,
    };
  }

  resetSessionIdentity(): void {
    this.local.actorId = null;
    this.local.ownerConnectionId = null;
    this.local.uid = null;
    this.kills.length = 0;
  }

  private prune(now = Date.now()): void {
    const keepMs = this.opts.keepMs ?? 6000;
    while (this.kills.length && now - this.kills[0].at > keepMs) {
      this.kills.shift();
    }
  }
}