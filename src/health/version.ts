import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Resolve the project root by walking up from this module's directory until
 * a package.json is found. Works for both src/ (ts-node) and dist/ (node)
 * runtimes without depending on process.cwd(), which can be set to anywhere
 * by the caller of the binary.
 */
function loadVersion(): string {
  const candidates = [
    join(__dirname, '..', '..', 'package.json'),
    join(__dirname, '..', '..', '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw) as { version?: string };
      if (typeof parsed.version === 'string' && parsed.version.length > 0) {
        return parsed.version;
      }
    } catch {
      // Try next candidate.
    }
  }
  return 'unknown';
}

export const PACKAGE_VERSION = loadVersion();
