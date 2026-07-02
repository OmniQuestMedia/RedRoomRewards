/**
 * Program-tenant resolution (RRR-#2 Phase B).
 *
 * `tenant_id` is the loyalty-PROGRAM isolation boundary. Today RRR runs a single
 * OmniQuest program and the four sites are MERCHANTS within it, so every
 * money-store query scopes by the one program tenant. The value is read from
 * config (`RRR_PROGRAM_TENANT_ID`); `oqmi` is the canonical default until
 * per-request tenant resolution (a future phase) supersedes it. Centralising it
 * here keeps the tenant value out of scattered literals in service code.
 *
 * @module config/program-tenant
 */

/** Canonical OmniQuest program tenant — the default when config is unset. */
export const DEFAULT_PROGRAM_TENANT_ID = 'oqmi';

/**
 * The configured program tenant_id (the isolation boundary for money-store
 * queries). Reads `RRR_PROGRAM_TENANT_ID`, falling back to the canonical
 * default.
 */
export function getProgramTenantId(): string {
  return (process.env.RRR_PROGRAM_TENANT_ID ?? '').trim() || DEFAULT_PROGRAM_TENANT_ID;
}

/**
 * Resolve the tenant_id for a money-store operation, preferring an explicit
 * (request-context) tenant when the caller supplies one, else the program
 * tenant. Lets callers that already carry a tenant (e.g. earn/burn requests)
 * pass it through while single-program flows fall back to config.
 */
export function resolveTenantId(explicit?: string | null): string {
  const t = (explicit ?? '').trim();
  return t || getProgramTenantId();
}
