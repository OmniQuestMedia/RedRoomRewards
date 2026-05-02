<?php
/**
 * RRR HTTP client.
 *
 * Implements docs/AUTH_CONTRACT.md §4 (canonical signing string) and §3
 * (request envelope). Constructs signed requests; parses responses; never
 * logs the secret, signature, or full request body.
 *
 * @package RedRoomRewards
 */

if (!defined('ABSPATH')) {
    exit;
}

final class RRR_Client {
    /** Path prefix the API server sees on every request. */
    private const PATH_PREFIX = '/api/v1';

    /**
     * Sign + send a state-changing POST. Caller supplies the operation path
     * (e.g. '/earn'), the body payload (associative array, JSON-encoded), and
     * a stable idempotency key (UUID v4) that survives retries.
     *
     * Returns an associative array:
     *   [
     *     'ok'         => bool,
     *     'http_code'  => int,
     *     'body'       => array|null,        // decoded JSON
     *     'request_id' => string|null,       // X-Request-ID echoed by server
     *     'error_code' => string|null,       // server-side error code on !ok
     *   ]
     *
     * Network failures surface as ok=false with http_code=0.
     */
    public static function post(string $path, array $body, string $idempotency_key): array {
        $body_json = wp_json_encode($body, JSON_UNESCAPED_SLASHES);
        if ($body_json === false) {
            return self::error_result(0, 'CLIENT_ENCODE_FAILED');
        }

        $headers = self::build_signed_headers('POST', $path, $body_json);
        $headers['X-Idempotency-Key'] = $idempotency_key;
        $headers['Content-Type']      = 'application/json';

        return self::dispatch('POST', $path, $headers, $body_json);
    }

    /**
     * Sign + send a GET. No idempotency key (GETs are idempotent by definition).
     */
    public static function get(string $path): array {
        $headers = self::build_signed_headers('GET', $path, '');
        return self::dispatch('GET', $path, $headers, null);
    }

    /**
     * Build the full set of HMAC-envelope headers (X-RRR-Tenant, Key-Id,
     * Timestamp, Nonce, Signature). The signature covers METHOD + path +
     * timestamp + nonce + sha256(body) per AUTH_CONTRACT §4.
     */
    public static function build_signed_headers(string $method, string $path, string $body): array {
        $timestamp = gmdate('Y-m-d\TH:i:s\Z');
        $nonce     = self::uuid_v4();
        $body_hash = hash('sha256', $body);

        $canonical_path = self::PATH_PREFIX . $path;
        $canonical = implode("\n", [
            strtoupper($method),
            $canonical_path,
            $timestamp,
            $nonce,
            $body_hash,
        ]);

        $signature = hash_hmac('sha256', $canonical, RRR_Config::api_secret());

        return [
            'X-RRR-Tenant'    => RRR_Config::tenant_id(),
            'X-RRR-Key-Id'    => RRR_Config::api_key_id(),
            'X-RRR-Timestamp' => $timestamp,
            'X-RRR-Nonce'     => $nonce,
            'X-RRR-Signature' => $signature,
        ];
    }

    /**
     * Stand-alone canonical-string builder so unit tests can assert the
     * exact bytes signed without going through the network layer.
     */
    public static function canonical_signing_string(
        string $method,
        string $path,
        string $timestamp,
        string $nonce,
        string $body
    ): string {
        return implode("\n", [
            strtoupper($method),
            self::PATH_PREFIX . $path,
            $timestamp,
            $nonce,
            hash('sha256', $body),
        ]);
    }

    /**
     * UUID v4 generator. Uses random_bytes() for cryptographic randomness;
     * never falls back to mt_rand() / uniqid() (those would produce predictable
     * nonces, which would defeat the replay-window protection).
     */
    public static function uuid_v4(): string {
        $bytes = random_bytes(16);
        // Set version (0100) and variant (10xx).
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        );
    }

    /**
     * Dispatch the actual HTTP request. Uses wp_remote_request; surfaces
     * network errors as ok=false with http_code=0.
     */
    private static function dispatch(string $method, string $path, array $headers, ?string $body): array {
        $url = RRR_Config::api_base() . $path;
        $args = [
            'method'  => $method,
            'headers' => $headers,
            'timeout' => 15,
            'redirection' => 0, // never follow redirects on signed requests
        ];
        if ($body !== null) {
            $args['body'] = $body;
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            self::log_failure($path, 0, $response->get_error_message(), null);
            return self::error_result(0, 'CLIENT_NETWORK_ERROR');
        }

        $http_code = (int) wp_remote_retrieve_response_code($response);
        $raw_body  = wp_remote_retrieve_body($response);
        $request_id = wp_remote_retrieve_header($response, 'x-request-id') ?: null;

        $decoded = null;
        if (is_string($raw_body) && $raw_body !== '') {
            $decoded = json_decode($raw_body, true);
            if (!is_array($decoded)) {
                $decoded = null;
            }
        }

        $ok = ($http_code >= 200 && $http_code < 300);
        $error_code = null;
        if (!$ok && is_array($decoded) && isset($decoded['code']) && is_string($decoded['code'])) {
            $error_code = $decoded['code'];
        }

        // Per docs/integrations/redroompleasures-wordpress.md §9 logging hygiene:
        // every failure logs path, http_code, reason, request_id (and nothing else).
        if (!$ok) {
            self::log_failure($path, $http_code, $error_code ?? 'no_error_code', is_string($request_id) ? $request_id : null);
        }

        return [
            'ok'         => $ok,
            'http_code'  => $http_code,
            'body'       => $decoded,
            'request_id' => is_string($request_id) ? $request_id : null,
            'error_code' => $error_code,
        ];
    }

    private static function error_result(int $http_code, string $code): array {
        return [
            'ok'         => false,
            'http_code'  => $http_code,
            'body'       => null,
            'request_id' => null,
            'error_code' => $code,
        ];
    }

    /**
     * Log a failure without leaking secrets. Logs only the path, http_code,
     * a short reason, and the request_id (if present). Never the body, never
     * the signature, never the secret.
     */
    private static function log_failure(string $path, int $http_code, string $reason, ?string $request_id): void {
        if (function_exists('error_log')) {
            error_log(sprintf(
                '[RRR] %s failed http=%d reason=%s request_id=%s',
                $path,
                $http_code,
                $reason,
                $request_id ?? '-',
            ));
        }
    }
}
