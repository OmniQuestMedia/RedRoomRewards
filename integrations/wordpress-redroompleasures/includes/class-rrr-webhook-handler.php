<?php
/**
 * Inbound webhook handler — receives signed deliveries from RRR.
 *
 * Subscribed events for Alpha (per docs/integrations/redroompleasures-wordpress.md §5):
 *   - earn.confirmed       (informational; updates local cache)
 *   - refund.applied       (notify member; update local order record)
 *   - expiration.warning   (notify member with expiring amount)
 *
 * Idempotency: stores seen event_ids in a transient for 7 days. Duplicate
 * deliveries from RRR's retry logic are processed once.
 *
 * @package RedRoomRewards
 */

if (!defined('ABSPATH')) {
    exit;
}

final class RRR_Webhook_Handler {
    private const NAMESPACE = 'rrr/v1';
    private const ROUTE     = '/webhook';

    /** Replay window must match RRR's server-side enforcement. */
    private const REPLAY_WINDOW_SECONDS = 300; // ±5 minutes

    /** Dedupe TTL for seen event_ids (7 days). */
    private const DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;

    public static function register_route(): void {
        register_rest_route(self::NAMESPACE, self::ROUTE, [
            'methods'             => 'POST',
            'callback'            => [self::class, 'handle'],
            'permission_callback' => '__return_true', // Auth is HMAC, not nonce / cap.
        ]);
        add_action('rrr_webhook_cleanup', [self::class, 'cleanup_dedupe_record']);
    }

    /**
     * WP-cron callback: remove an expired dedupe-claim option. Scheduled at
     * the same time the claim is created (now + DEDUPE_TTL_SECONDS).
     */
    public static function cleanup_dedupe_record(string $dedupe_key): void {
        delete_option($dedupe_key);
    }

    public static function handle(WP_REST_Request $request): WP_REST_Response {
        $tenant   = $request->get_header('X-RRR-Tenant');
        $key_id   = $request->get_header('X-RRR-Key-Id');
        $ts       = $request->get_header('X-RRR-Timestamp');
        $nonce    = $request->get_header('X-RRR-Nonce');
        $sig      = $request->get_header('X-RRR-Signature');
        $body     = $request->get_body();

        if (!self::verify_signature($tenant, $key_id, $ts, $nonce, $sig, $body)) {
            return new WP_REST_Response(['error' => 'AUTH_INVALID'], 401);
        }

        $payload = json_decode($body, true);
        if (!is_array($payload)) {
            return new WP_REST_Response(['error' => 'VALIDATION_ERROR'], 400);
        }

        $event_id = isset($payload['event_id']) && is_string($payload['event_id'])
            ? $payload['event_id']
            : null;
        if ($event_id === null) {
            return new WP_REST_Response(['error' => 'VALIDATION_ERROR'], 400);
        }

        // Idempotent dispatch — process once, return 200 on duplicates.
        // Atomic-claim via add_option: WP options have a unique-key constraint
        // at the DB layer, so add_option() returns true only for the first
        // caller; concurrent deliveries of the same event_id race on insert and
        // exactly one wins. (get_transient + set_transient is non-atomic and
        // would let duplicates slip through under burst delivery.)
        $dedupe_key = 'rrr_webhook_seen_' . md5($event_id);
        $claimed = add_option($dedupe_key, [
            'claimed_at' => time(),
            'expires_at' => time() + self::DEDUPE_TTL_SECONDS,
        ], '', false);
        if (!$claimed) {
            return new WP_REST_Response(['status' => 'duplicate', 'event_id' => $event_id], 200);
        }
        // Schedule cleanup so the options table doesn't grow without bound.
        // (WP cron is approximate; that's fine — we only need it to fire
        // sometime after DEDUPE_TTL_SECONDS so the dedupe window is honored.)
        if (!wp_next_scheduled('rrr_webhook_cleanup', [$dedupe_key])) {
            wp_schedule_single_event(time() + self::DEDUPE_TTL_SECONDS, 'rrr_webhook_cleanup', [$dedupe_key]);
        }

        $event_type = isset($payload['type']) && is_string($payload['type'])
            ? $payload['type']
            : '';

        try {
            self::dispatch($event_type, $payload);
            set_transient($dedupe_key, 1, self::DEDUPE_TTL_SECONDS);
            return new WP_REST_Response(['status' => 'accepted', 'event_id' => $event_id], 200);
        } catch (Throwable $e) {
            // Don't leak internals; log + return generic. RRR will retry.
            if (function_exists('error_log')) {
                error_log(sprintf('[RRR webhook] dispatch failed event_id=%s reason=%s', $event_id, $e->getMessage()));
            }
            return new WP_REST_Response(['error' => 'INTERNAL_ERROR'], 500);
        }
    }

    /**
     * Constant-time HMAC verification matching docs/AUTH_CONTRACT.md §4.
     */
    public static function verify_signature(
        ?string $tenant,
        ?string $key_id,
        ?string $ts,
        ?string $nonce,
        ?string $sig,
        string $body
    ): bool {
        if (!is_string($tenant) || $tenant !== RRR_Config::tenant_id()) {
            return false;
        }
        // AUTH_CONTRACT.md §11: unknown X-RRR-Key-Id → 401 AUTH_INVALID. The
        // key id must match the configured active key. (Future overlap-style
        // rotation will accept either the active or the prior key from a small
        // allowlist; for Alpha we have one active key per tenant.)
        if (!is_string($key_id) || $key_id !== RRR_Config::api_key_id()) {
            return false;
        }
        if (!is_string($ts) || !is_string($nonce) || !is_string($sig)) {
            return false;
        }

        // AUTH_CONTRACT.md §3 requires X-RRR-Timestamp to be RFC 3339 UTC
        // (e.g. "2026-04-28T13:42:00Z"). strtotime() is too permissive — it
        // accepts "now", "yesterday", and other natural-language inputs.
        // Strict-parse the exact format and reject anything else.
        $parsed = DateTimeImmutable::createFromFormat('Y-m-d\TH:i:s\Z', $ts, new DateTimeZone('UTC'));
        if ($parsed === false || $parsed->format('Y-m-d\TH:i:s\Z') !== $ts) {
            return false;
        }
        $ts_unix = $parsed->getTimestamp();
        if (abs(time() - $ts_unix) > self::REPLAY_WINDOW_SECONDS) {
            return false;
        }

        // Rebuild canonical string. Path is the path of THIS endpoint as RRR sees it.
        $path = '/wp-json/' . self::NAMESPACE . self::ROUTE;
        $body_hash = hash('sha256', $body);
        $canonical = implode("\n", ['POST', $path, $ts, $nonce, $body_hash]);

        $expected = hash_hmac('sha256', $canonical, RRR_Config::api_secret());

        // hash_equals is constant-time. NEVER use === for signature comparison.
        return hash_equals($expected, $sig);
    }

    /**
     * Dispatch the event to its handler. Throws Throwable on permanent failure
     * (handled at the WP_REST_Response layer); returns void on success.
     */
    private static function dispatch(string $event_type, array $payload): void {
        switch ($event_type) {
            case 'earn.confirmed':
                self::handle_earn_confirmed($payload);
                break;
            case 'refund.applied':
                self::handle_refund_applied($payload);
                break;
            case 'expiration.warning':
                self::handle_expiration_warning($payload);
                break;
            default:
                // Unknown event type — log and accept. Don't 4xx, since RRR
                // may add new event types we haven't subscribed to handle yet,
                // and 4xx would trigger their retry logic.
                if (function_exists('error_log')) {
                    error_log('[RRR webhook] unknown event type=' . $event_type);
                }
        }
    }

    /**
     * earn.confirmed: nothing required — the WC order's _rrr_earn_ledger_entry_id
     * was already set on the synchronous earn call. This event is a confirmation
     * for any out-of-band earn (e.g. operator-issued credit). Fire a do_action so
     * a host theme can hook in.
     */
    private static function handle_earn_confirmed(array $payload): void {
        do_action('rrr_earn_confirmed', $payload);
    }

    /**
     * refund.applied: an OQMI Operator issued a refund affecting one of our
     * members. Surface as an order note if we can match it to a WC order, and
     * emit a hook for the host theme to send the customer email.
     */
    private static function handle_refund_applied(array $payload): void {
        $external_ref = $payload['external_ref'] ?? null;
        if (is_array($external_ref) && ($external_ref['type'] ?? null) === 'wc_order') {
            $order_id = isset($external_ref['id']) ? (int) $external_ref['id'] : 0;
            if ($order_id > 0) {
                $order = wc_get_order($order_id);
                if ($order instanceof WC_Order) {
                    $order->add_order_note(sprintf(
                        'RRR refund applied: %d points returned (event_id=%s).',
                        (int) ($payload['points_refunded'] ?? 0),
                        (string) ($payload['event_id'] ?? '-'),
                    ));
                }
            }
        }
        do_action('rrr_refund_applied', $payload);
    }

    /**
     * expiration.warning: a member has points expiring within the warning
     * window. Pure host-theme concern — emit a hook with the payload and let
     * the theme handle the email.
     */
    private static function handle_expiration_warning(array $payload): void {
        do_action('rrr_expiration_warning', $payload);
    }
}
