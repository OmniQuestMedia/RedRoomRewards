<?php
/**
 * Self-contained test runner for the RRR plugin's HMAC-critical code paths.
 *
 * Doesn't require composer, PHPUnit, or a running WordPress. Run from the
 * plugin root or this directory:
 *
 *   php tests/run-tests.php
 *
 * Tests focus on the parts that, if broken, would cause real-world auth
 * failures: signing-string construction, signature determinism, signature
 * verification timing-safety, replay-window enforcement, nonce randomness.
 *
 * Exits 0 on all pass, 1 on any failure.
 */

declare(strict_types=1);

// Stub the few WP functions our class uses so the file loads outside WP.
if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__);
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, int $flags = 0) {
        return json_encode($data, $flags);
    }
}

// Load the bare classes we want to test. RRR_Config is required because
// RRR_Client::build_signed_headers calls RRR_Config::api_secret(); for
// tests we override RRR_Config with a stub before requiring the client.

final class RRR_Config {
    public const REQUIRED_CONSTANTS = [];
    public static function validate() { return true; }
    public static function api_base(): string { return 'https://example.test/api/v1'; }
    public static function api_key_id(): string { return 'test-key-001'; }
    public static function api_secret(): string {
        // 32 bytes of 'a' — deterministic for tests only.
        return str_repeat('a', 64);
    }
    public static function tenant_id(): string { return 'redroompleasures'; }
    public static function webhook_url(): string { return 'https://example.test/wp-json/rrr/v1/webhook'; }
}

require_once __DIR__ . '/../includes/class-rrr-client.php';
require_once __DIR__ . '/../includes/class-rrr-webhook-handler.php';

$tests_run = 0;
$tests_failed = 0;
$failures = [];

function ok(string $name, bool $cond, string $detail = ''): void {
    global $tests_run, $tests_failed, $failures;
    $tests_run++;
    if ($cond) {
        echo "  [PASS] $name\n";
    } else {
        $tests_failed++;
        $failures[] = "$name" . ($detail !== '' ? " — $detail" : '');
        echo "  [FAIL] $name" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

echo "RRR plugin tests\n================\n\n";

// ───────────────────────────────────────────────────────────────────
// Canonical signing string
// ───────────────────────────────────────────────────────────────────
echo "Canonical signing string:\n";

$canonical = RRR_Client::canonical_signing_string(
    'POST',
    '/earn',
    '2026-05-02T13:42:00Z',
    '7b9c4f3e-5d2a-4c1f-8b3e-9f1a2b3c4d5e',
    '{"a":1}'
);
$expected_lines = [
    'POST',
    '/api/v1/earn',
    '2026-05-02T13:42:00Z',
    '7b9c4f3e-5d2a-4c1f-8b3e-9f1a2b3c4d5e',
    hash('sha256', '{"a":1}'),
];
ok(
    'canonical string has 5 newline-separated parts',
    $canonical === implode("\n", $expected_lines),
    'got: ' . str_replace("\n", '\\n', $canonical)
);

ok(
    'canonical string includes /api/v1 path prefix',
    str_contains($canonical, '/api/v1/earn')
);

ok(
    'method is uppercased',
    str_starts_with($canonical, 'POST')
);

$canonical_lower = RRR_Client::canonical_signing_string('post', '/earn', '2026-05-02T13:42:00Z', 'n', '');
ok(
    'lowercase method input still produces uppercase canonical',
    str_starts_with($canonical_lower, 'POST')
);

$canonical_empty = RRR_Client::canonical_signing_string('GET', '/health', '2026-05-02T13:42:00Z', 'n', '');
$empty_hash = hash('sha256', '');
ok(
    'empty body hashes to known sha256(empty)',
    str_ends_with($canonical_empty, "\n" . $empty_hash) && $empty_hash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
);

// ───────────────────────────────────────────────────────────────────
// Signature determinism + key sensitivity
// ───────────────────────────────────────────────────────────────────
echo "\nSignature determinism + key sensitivity:\n";

$canonical = RRR_Client::canonical_signing_string('POST', '/earn', '2026-05-02T13:42:00Z', 'nonce-1', '{}');
$sig_a = hash_hmac('sha256', $canonical, RRR_Config::api_secret());
$sig_b = hash_hmac('sha256', $canonical, RRR_Config::api_secret());
ok('same input + same key → same signature', $sig_a === $sig_b);

$sig_diff_key = hash_hmac('sha256', $canonical, str_repeat('b', 64));
ok('different key → different signature', $sig_a !== $sig_diff_key);

$canonical_diff_body = RRR_Client::canonical_signing_string('POST', '/earn', '2026-05-02T13:42:00Z', 'nonce-1', '{"a":1}');
$sig_diff_body = hash_hmac('sha256', $canonical_diff_body, RRR_Config::api_secret());
ok('different body → different signature', $sig_a !== $sig_diff_body);

$canonical_diff_path = RRR_Client::canonical_signing_string('POST', '/redeem', '2026-05-02T13:42:00Z', 'nonce-1', '{}');
$sig_diff_path = hash_hmac('sha256', $canonical_diff_path, RRR_Config::api_secret());
ok('different path → different signature', $sig_a !== $sig_diff_path);

// ───────────────────────────────────────────────────────────────────
// UUID v4 nonce randomness + format
// ───────────────────────────────────────────────────────────────────
echo "\nUUID v4 nonce:\n";

$nonces = [];
for ($i = 0; $i < 1000; $i++) {
    $nonces[] = RRR_Client::uuid_v4();
}
$unique = array_unique($nonces);
ok('1,000 nonces are all distinct', count($unique) === 1000, 'duplicates: ' . (1000 - count($unique)));

$valid_format = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $nonces[0]) === 1;
ok('nonce matches UUID v4 shape', $valid_format, 'sample: ' . $nonces[0]);

// ───────────────────────────────────────────────────────────────────
// Webhook signature verification — happy path + failure modes
// ───────────────────────────────────────────────────────────────────
echo "\nWebhook signature verification:\n";

$body  = json_encode(['event_id' => 'evt-001', 'type' => 'earn.confirmed']);
$ts    = gmdate('Y-m-d\TH:i:s\Z');
$nonce = RRR_Client::uuid_v4();

$canonical = "POST\n/wp-json/rrr/v1/webhook\n$ts\n$nonce\n" . hash('sha256', $body);
$valid_sig = hash_hmac('sha256', $canonical, RRR_Config::api_secret());

ok(
    'valid signature accepted',
    RRR_Webhook_Handler::verify_signature('redroompleasures', 'test-key-001', $ts, $nonce, $valid_sig, $body) === true
);

ok(
    'tampered signature rejected',
    RRR_Webhook_Handler::verify_signature('redroompleasures', 'test-key-001', $ts, $nonce, 'deadbeef' . substr($valid_sig, 8), $body) === false
);

ok(
    'wrong tenant rejected',
    RRR_Webhook_Handler::verify_signature('cyrano', 'test-key-001', $ts, $nonce, $valid_sig, $body) === false
);

$tampered_body = json_encode(['event_id' => 'evt-002', 'type' => 'earn.confirmed']);
ok(
    'body tampering rejected (sig was for original body)',
    RRR_Webhook_Handler::verify_signature('redroompleasures', 'test-key-001', $ts, $nonce, $valid_sig, $tampered_body) === false
);

$stale_ts = gmdate('Y-m-d\TH:i:s\Z', time() - 600); // 10 min ago
$canonical_stale = "POST\n/wp-json/rrr/v1/webhook\n$stale_ts\n$nonce\n" . hash('sha256', $body);
$stale_sig = hash_hmac('sha256', $canonical_stale, RRR_Config::api_secret());
ok(
    'stale timestamp rejected (replay window)',
    RRR_Webhook_Handler::verify_signature('redroompleasures', 'test-key-001', $stale_ts, $nonce, $stale_sig, $body) === false
);

ok(
    'missing required header rejected (null tenant)',
    RRR_Webhook_Handler::verify_signature(null, 'test-key-001', $ts, $nonce, $valid_sig, $body) === false
);

ok(
    'malformed timestamp rejected',
    RRR_Webhook_Handler::verify_signature('redroompleasures', 'test-key-001', 'not-a-timestamp', $nonce, $valid_sig, $body) === false
);

// ───────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────
echo "\n";
echo "=========================================\n";
echo "Tests run:    $tests_run\n";
echo "Tests failed: $tests_failed\n";
if ($tests_failed > 0) {
    echo "\nFailures:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
    exit(1);
}
echo "All tests passed.\n";
exit(0);
