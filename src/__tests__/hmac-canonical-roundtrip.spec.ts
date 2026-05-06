import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

/**
 * HMAC §4 canonical roundtrip — Alpha test pack Bucket B target.
 *
 * The reference signRequest / verifyRequest snippets in
 * docs/AUTH_CONTRACT.md §10 are the spec we hand to merchant
 * integrators. This test makes both snippets executable so the
 * documented behaviour can't quietly drift away from a working
 * implementation.
 *
 * What's pinned here:
 *   - The canonical signing string is exactly:
 *         METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_HEX(body)
 *   - Signature comparison uses crypto.timingSafeEqual (constant-time).
 *   - Tampering with method, path, timestamp, nonce, or body fails the
 *     check.
 *   - The replay window is exactly ±5 minutes from server time and is
 *     enforced before signature comparison.
 *
 * This test does NOT exercise the live webhook-receive path — that path
 * uses a transient Alpha-only canonical (§8.1) and has its own spec at
 * src/webhooks/__tests__/webhook-receive.service.spec.ts. When the
 * migration in §8.2 lands, the live verifier will use this canonical and
 * these assertions will become its contract.
 */

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

interface SignParams {
  method: string;
  path: string;
  body: string;
  apiSecret: string;
  timestamp?: string;
  nonce?: string;
}

interface SignedEnvelope {
  timestamp: string;
  nonce: string;
  signature: string;
  bodyHash: string;
}

function signRequest(opts: SignParams): SignedEnvelope {
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const nonce = opts.nonce ?? randomUUID();
  const bodyHash = createHash('sha256').update(opts.body).digest('hex');
  const canonical = [opts.method.toUpperCase(), opts.path, timestamp, nonce, bodyHash].join('\n');
  const signature = createHmac('sha256', opts.apiSecret).update(canonical).digest('hex');
  return { timestamp, nonce, signature, bodyHash };
}

function verifyRequest(opts: {
  method: string;
  path: string;
  body: string;
  timestamp: string;
  nonce: string;
  signature: string;
  apiSecret: string;
  serverTime: Date;
}): boolean {
  const tsMs = Date.parse(opts.timestamp);
  if (Number.isNaN(tsMs)) return false;
  if (Math.abs(opts.serverTime.getTime() - tsMs) > REPLAY_WINDOW_MS) return false;

  const bodyHash = createHash('sha256').update(opts.body).digest('hex');
  const canonical = [
    opts.method.toUpperCase(),
    opts.path,
    opts.timestamp,
    opts.nonce,
    bodyHash,
  ].join('\n');
  const expected = createHmac('sha256', opts.apiSecret).update(canonical).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(opts.signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

describe('AUTH_CONTRACT §4 — HMAC canonical signing string', () => {
  const SECRET = 'a'.repeat(64);
  const BODY = JSON.stringify({
    member_id: 'abc-123',
    merchant_id: 'redroompleasures',
    amount: 42,
  });

  it('produces a canonical string of exactly five LF-separated fields', () => {
    // The order is METHOD, PATH, TIMESTAMP, NONCE, BODY_HASH.
    // Any reordering or extra delimiter is an immediate signature failure.
    const ts = '2026-05-03T00:00:00.000Z';
    const nonce = '00000000-0000-4000-8000-000000000000';
    const env = signRequest({
      method: 'POST',
      path: '/api/v1/earn',
      body: BODY,
      apiSecret: SECRET,
      timestamp: ts,
      nonce,
    });
    const expectedCanonical = `POST\n/api/v1/earn\n${ts}\n${nonce}\n${env.bodyHash}`;
    const expectedSig = createHmac('sha256', SECRET).update(expectedCanonical).digest('hex');
    expect(env.signature).toBe(expectedSig);
    expect(expectedCanonical.split('\n')).toHaveLength(5);
  });

  it('uses lower-case hex for the body hash', () => {
    const env = signRequest({
      method: 'POST',
      path: '/api/v1/earn',
      body: BODY,
      apiSecret: SECRET,
    });
    expect(env.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes the empty string for an empty body', () => {
    const env = signRequest({
      method: 'GET',
      path: '/api/v1/wallets/u-1/balance',
      body: '',
      apiSecret: SECRET,
    });
    // SHA-256 of the empty string is a well-known constant.
    expect(env.bodyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('uppercases the HTTP method in the canonical even when caller sends lower-case', () => {
    const ts = '2026-05-03T00:00:00.000Z';
    const nonce = 'fixed-nonce';
    const upper = signRequest({
      method: 'POST',
      path: '/api/v1/earn',
      body: BODY,
      apiSecret: SECRET,
      timestamp: ts,
      nonce,
    });
    const lower = signRequest({
      method: 'post',
      path: '/api/v1/earn',
      body: BODY,
      apiSecret: SECRET,
      timestamp: ts,
      nonce,
    });
    expect(lower.signature).toBe(upper.signature);
  });
});

describe('AUTH_CONTRACT §4 — sign/verify roundtrip', () => {
  const SECRET = 'a'.repeat(64);
  const BODY = JSON.stringify({ amount: 42 });
  const PATH = '/api/v1/earn';

  it('verifies a freshly-signed request', () => {
    const env = signRequest({ method: 'POST', path: PATH, body: BODY, apiSecret: SECRET });
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: env.timestamp,
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: SECRET,
      serverTime: new Date(env.timestamp),
    });
    expect(ok).toBe(true);
  });

  it.each([
    ['method change', { method: 'GET' }],
    ['path change', { path: '/api/v1/redeem' }],
    ['body change', { body: JSON.stringify({ amount: 4200 }) }],
    ['nonce tampered', { nonce: 'tampered' }],
    ['timestamp tampered', { timestamp: '2026-05-03T00:00:00.000Z' }],
  ])('rejects on %s', (_label, override) => {
    const env = signRequest({ method: 'POST', path: PATH, body: BODY, apiSecret: SECRET });
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: env.timestamp,
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: SECRET,
      serverTime: new Date(env.timestamp),
      ...override,
    });
    expect(ok).toBe(false);
  });

  it('rejects when the wrong api_secret is used to verify', () => {
    const env = signRequest({ method: 'POST', path: PATH, body: BODY, apiSecret: SECRET });
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: env.timestamp,
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: 'different-secret-of-the-same-length-padding-padding-padding-pa',
      serverTime: new Date(env.timestamp),
    });
    expect(ok).toBe(false);
  });

  it('rejects when the signature byte length does not match (timingSafeEqual throws inside)', () => {
    const env = signRequest({ method: 'POST', path: PATH, body: BODY, apiSecret: SECRET });
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: env.timestamp,
      nonce: env.nonce,
      signature: 'ab', // 1 byte instead of 32
      apiSecret: SECRET,
      serverTime: new Date(env.timestamp),
    });
    expect(ok).toBe(false);
  });
});

describe('AUTH_CONTRACT §5 — replay window', () => {
  const SECRET = 'a'.repeat(64);
  const BODY = JSON.stringify({ amount: 42 });
  const PATH = '/api/v1/earn';

  it('accepts a request signed exactly at server time', () => {
    const ts = '2026-05-03T00:00:00.000Z';
    const env = signRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      apiSecret: SECRET,
      timestamp: ts,
    });
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: ts,
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: SECRET,
      serverTime: new Date(ts),
    });
    expect(ok).toBe(true);
  });

  it('accepts a request signed 4 minutes in the past', () => {
    const ts = '2026-05-03T00:00:00.000Z';
    const env = signRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      apiSecret: SECRET,
      timestamp: ts,
    });
    const serverTime = new Date(Date.parse(ts) + 4 * 60 * 1000);
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: ts,
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: SECRET,
      serverTime,
    });
    expect(ok).toBe(true);
  });

  it('rejects a request signed 6 minutes in the past', () => {
    const ts = '2026-05-03T00:00:00.000Z';
    const env = signRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      apiSecret: SECRET,
      timestamp: ts,
    });
    const serverTime = new Date(Date.parse(ts) + 6 * 60 * 1000);
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: ts,
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: SECRET,
      serverTime,
    });
    expect(ok).toBe(false);
  });

  it('rejects a request whose timestamp is unparseable garbage', () => {
    const env = signRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      apiSecret: SECRET,
      timestamp: 'not-a-date',
    });
    const ok = verifyRequest({
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: 'not-a-date',
      nonce: env.nonce,
      signature: env.signature,
      apiSecret: SECRET,
      serverTime: new Date('2026-05-03T00:00:00.000Z'),
    });
    expect(ok).toBe(false);
  });
});
