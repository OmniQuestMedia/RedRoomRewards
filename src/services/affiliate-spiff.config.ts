/**
 * Affiliate account-spiff lever.
 *
 * A configurable promotional lever: the RRR points awarded to a referring
 * creator each time a referred guest opens a new RedRoomPleasures / RedRoomRewards
 * account. Value + active window (startsAt/endsAt) + on/off are all env-
 * overridable so ops can tune the amount/window without a code change.
 *
 * @module services/affiliate-spiff.config
 */

export interface AffiliateSpiffLever {
  enabled: boolean;
  /** ISO-8601 inclusive start; null = no start bound. */
  startsAt: string | null;
  /** ISO-8601 exclusive end; null = no end bound. */
  endsAt: string | null;
  /** RRR points awarded per referred new account. */
  points: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

function envStrOrNull(name: string): string | null {
  const raw = process.env[name];
  return raw == null || raw.trim() === '' ? null : raw.trim();
}

export const AFFILIATE_ACCOUNT_SPIFF: AffiliateSpiffLever = {
  enabled: envBool('AFFILIATE_SPIFF_ENABLED', true),
  startsAt: envStrOrNull('AFFILIATE_SPIFF_STARTS_AT'),
  endsAt: envStrOrNull('AFFILIATE_SPIFF_ENDS_AT'),
  points: envInt('AFFILIATE_SPIFF_POINTS', 1000),
};

/** True when `at` falls inside the lever's active window and it is enabled. */
export function isSpiffActive(lever: AffiliateSpiffLever, at: Date): boolean {
  if (!lever.enabled) return false;
  const t = at.getTime();
  if (lever.startsAt != null && t < new Date(lever.startsAt).getTime()) return false;
  if (lever.endsAt != null && t >= new Date(lever.endsAt).getTime()) return false;
  return true;
}
