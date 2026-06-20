/**
 * OKIB Integration Service (scaffolding)
 *
 * Gated, advisory integration layer between RedRoomRewards and OKIB
 * (OmniQuest Knowledge & Intelligence Bus — the cross-platform
 * personalization / intelligence layer). See `docs/okib-integration-plan.md`.
 *
 * Contract for this cut:
 * - Every method is gated behind `OKIB_ENABLED` (default off).
 * - When disabled (or misconfigured, or on error) methods return a typed,
 *   neutral result with `enabled: false`. They NEVER throw and NEVER block.
 * - OKIB is advisory only: it is never in the path of the ledger, wallet,
 *   earn, or redeem. A failed OKIB call must not affect any money operation.
 * - Requests are PII-minimized: opaque `memberRef` / `tenantId` only.
 *
 * The retrieval methods are placeholders — they return neutral results until a
 * real OKIB endpoint is provisioned (plan §6, Wave 1+).
 *
 * @module services/okib-integration
 */

import { Injectable } from '@nestjs/common';
import logger from '../lib/logger';

/** Resolved OKIB configuration, derived once from the environment. */
export interface OkibConfig {
  /** Master gate. When false, the service is inert. */
  enabled: boolean;
  /** OKIB service base URL (HTTPS only). Undefined when not configured. */
  baseUrl?: string;
  /** HMAC key material for signing outbound calls. Undefined when not set. */
  apiKey?: string;
}

/** Common shape of every OKIB context request. PII-minimized by contract. */
export interface OkibContextRequest {
  /** Tenant the member belongs to (e.g. "redroompleasures"). */
  tenantId: string;
  /** Opaque member reference. Never an email or other direct identifier. */
  memberRef: string;
  /** Optional correlation id for tracing. */
  correlationId?: string;
}

/** A single ranked product-context hint (category-level, no raw catalog data). */
export interface OkibProductHint {
  /** Product or category reference understood by the storefront. */
  ref: string;
  /** Relevance score in [0, 1]. */
  score: number;
  /** Why this was surfaced (e.g. "category_affinity", "points_reachable"). */
  rationale: string;
}

export interface PersonalizedProductContext {
  enabled: boolean;
  hints: OkibProductHint[];
}

/** A next-best-action engagement nudge (advisory copy only). */
export interface OkibNudge {
  /** Stable nudge kind (e.g. "points_expiring", "tier_progress"). */
  kind: string;
  /** Short, member-facing message the storefront may render. */
  message: string;
  /** Relative priority in [0, 1]; higher surfaces first. */
  priority: number;
}

export interface EngagementNudgeContext {
  enabled: boolean;
  nudges: OkibNudge[];
}

/** Creator affinity result — feeds affiliate attribution (plan §4). */
export interface CreatorAffinityContext {
  enabled: boolean;
  /** Creator the member is most affiliated/engaged with, if any. */
  creatorId: string | null;
  /** Confidence in [0, 1]. */
  confidence: number;
}

/**
 * Reads OKIB configuration from the environment. Centralized so the gating
 * rule lives in exactly one place.
 *
 * Fail-open: if `OKIB_ENABLED` is true but `OKIB_BASE_URL`/`OKIB_API_KEY` are
 * missing, the service is treated as disabled (a warning is logged on use).
 */
export function loadOkibConfig(env: NodeJS.ProcessEnv = process.env): OkibConfig {
  const enabled = env.OKIB_ENABLED === 'true';
  return {
    enabled,
    baseUrl: env.OKIB_BASE_URL,
    apiKey: env.OKIB_API_KEY,
  };
}

@Injectable()
export class OkibIntegrationService {
  private readonly config: OkibConfig;

  constructor(config?: OkibConfig) {
    this.config = config ?? loadOkibConfig();
  }

  /**
   * True only when the flag is on AND required configuration is present.
   * Logs a one-line warning when enabled-but-misconfigured so the silent
   * fail-open is observable.
   */
  isEnabled(): boolean {
    if (!this.config.enabled) {
      return false;
    }
    if (!this.config.baseUrl || !this.config.apiKey) {
      logger.warn(
        'OKIB_ENABLED=true but OKIB_BASE_URL/OKIB_API_KEY missing — treating OKIB as disabled (fail-open)',
      );
      return false;
    }
    return true;
  }

  /**
   * Personalized product recommendations context (plan §2.1).
   *
   * PLACEHOLDER: returns a neutral result until a real OKIB endpoint is wired
   * (plan §6, Wave 1). When disabled, returns `{ enabled: false, hints: [] }`.
   */
  async getPersonalizedProductContext(
    request: OkibContextRequest,
  ): Promise<PersonalizedProductContext> {
    if (!this.isEnabled()) {
      return { enabled: false, hints: [] };
    }
    // TODO(okib-wave-1): HMAC-signed call to `${baseUrl}/context/products`.
    logger.info(
      { tenantId: request.tenantId, correlationId: request.correlationId },
      'OKIB getPersonalizedProductContext (placeholder — no upstream call yet)',
    );
    return { enabled: true, hints: [] };
  }

  /**
   * Engagement nudges context (plan §2.2).
   *
   * PLACEHOLDER: neutral result until wired (plan §6, Wave 2).
   */
  async getEngagementNudges(request: OkibContextRequest): Promise<EngagementNudgeContext> {
    if (!this.isEnabled()) {
      return { enabled: false, nudges: [] };
    }
    // TODO(okib-wave-2): HMAC-signed call to `${baseUrl}/context/nudges`.
    logger.info(
      { tenantId: request.tenantId, correlationId: request.correlationId },
      'OKIB getEngagementNudges (placeholder — no upstream call yet)',
    );
    return { enabled: true, nudges: [] };
  }

  /**
   * Creator-affinity context (plan §2.3 / §4).
   *
   * Intended to feed `AffiliateService.resolveBonus` in a later wave so the
   * correct creator attribution bonus is applied on purchase.
   *
   * PLACEHOLDER: neutral result until wired (plan §6, Wave 3 — also gated on
   * glossary ratification of the OKIB term).
   */
  async getCreatorAffinity(request: OkibContextRequest): Promise<CreatorAffinityContext> {
    if (!this.isEnabled()) {
      return { enabled: false, creatorId: null, confidence: 0 };
    }
    // TODO(okib-wave-3): HMAC-signed call to `${baseUrl}/context/creator-affinity`.
    logger.info(
      { tenantId: request.tenantId, correlationId: request.correlationId },
      'OKIB getCreatorAffinity (placeholder — no upstream call yet)',
    );
    return { enabled: true, creatorId: null, confidence: 0 };
  }
}
