/**
 * Startup Environment Validation
 *
 * Validates that critical environment variables are set before the application starts.
 * In production: throws on missing required vars.
 * In other environments: warns to stderr but allows startup.
 *
 * Required vars are determined from .env.example comments and middleware dependencies:
 * - JWT_SECRET (required by AuthMiddleware)
 * - QUEUE_AUTH_SECRET (required by auth service, marked REQUIRED in .env.example)
 * - RRR_WEBHOOK_SECRET (required by webhook handlers, marked REQUIRED in .env.example)
 *
 * Call this from app bootstrap before initializing NestJS modules.
 */

const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'QUEUE_AUTH_SECRET',
  'RRR_WEBHOOK_SECRET',
] as const;

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length === 0) {
    return;
  }

  const message = `Missing required env var(s): ${missing.join(', ')}`;

  if (isProduction) {
    throw new Error(message);
  } else {
    process.stderr.write(`WARNING: ${message}\n`);
  }
}
