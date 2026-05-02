<?php
/**
 * WooCommerce ↔ RRR hooks.
 *
 * Wires two flows:
 *   - On order completion → POST /earn (PROMOTIONAL_AWARD)
 *   - At checkout, when a customer applies points → POST /redeem (MERCHANT_ORDER_REDEMPTION)
 *
 * Idempotency keys are persisted on the WC order meta so retries — including
 * those triggered by transient HTTP failures — reuse the same key and never
 * double-credit / double-debit.
 *
 * @package RedRoomRewards
 */

if (!defined('ABSPATH')) {
    exit;
}

final class RRR_WooCommerce_Hooks {
    /** WC order meta key for the earn idempotency key. */
    private const META_EARN_KEY = '_rrr_earn_idempotency_key';
    /** WC order meta key recording successful earn (so we don't retry forever). */
    private const META_EARN_LEDGER_ID = '_rrr_earn_ledger_entry_id';
    /**
     * WC order meta key recording a permanent (4xx) earn failure. Set when
     * the server returns a deterministic rejection (e.g. EARN_NOT_ALLOWED for
     * Diamond Concierge per CEO D3) so the hook does NOT re-fire on subsequent
     * status transitions (processing → completed is a common case).
     * Holds the X-Request-ID and the server error code for traceability.
     */
    private const META_EARN_PERMANENT_FAILURE = '_rrr_earn_permanent_failure';
    /** WC order meta key for the redeem idempotency key. */
    private const META_REDEEM_KEY = '_rrr_redeem_idempotency_key';
    /** WC order meta key recording successful redeem. */
    private const META_REDEEM_LEDGER_ID = '_rrr_redeem_ledger_entry_id';
    /** WC order meta key for the redeem points-applied amount. */
    private const META_REDEEM_POINTS = '_rrr_redeem_points_applied';

    public static function register(): void {
        add_action('woocommerce_order_status_completed', [self::class, 'on_order_completed'], 10, 1);
        add_action('woocommerce_order_status_processing', [self::class, 'on_order_completed'], 10, 1);
    }

    /**
     * Fires on order completion. Idempotent — re-runs on the same order are
     * no-ops once an earn has been confirmed (META_EARN_LEDGER_ID set).
     */
    public static function on_order_completed(int $order_id): void {
        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order) {
            return;
        }

        // Skip if we've already recorded a successful earn for this order.
        if ($order->get_meta(self::META_EARN_LEDGER_ID) !== '') {
            return;
        }

        // Skip if we've previously recorded a deterministic 4xx failure.
        // Without this, processing → completed (a common WC transition) would
        // re-fire the hook and re-hit the same server-side rejection.
        if ($order->get_meta(self::META_EARN_PERMANENT_FAILURE) !== '') {
            return;
        }

        // Reuse the same idempotency key on retries; generate once per order.
        $idempotency_key = $order->get_meta(self::META_EARN_KEY);
        if ($idempotency_key === '') {
            $idempotency_key = RRR_Client::uuid_v4();
            $order->update_meta_data(self::META_EARN_KEY, $idempotency_key);
            $order->save();
        }

        $user_id = self::user_id_for_order($order);
        if ($user_id === null) {
            // Guest checkout, or no WP user attached. Earn requires a member.
            return;
        }

        $payload = [
            'tenant_id'        => RRR_Config::tenant_id(),
            'merchant_id'      => RRR_Config::tenant_id(),
            'user_id'          => $user_id,
            'amount_currency'  => $order->get_currency(),
            'amount'           => (float) $order->get_total(),
            'reason_code'      => 'PROMOTIONAL_AWARD',
            'external_ref'     => [
                'type' => 'wc_order',
                'id'   => (string) $order->get_id(),
            ],
        ];

        $result = RRR_Client::post('/earn', $payload, $idempotency_key);

        if ($result['ok']) {
            $ledger_id = $result['body']['ledger_entry_id'] ?? '';
            if (is_string($ledger_id) && $ledger_id !== '') {
                $order->update_meta_data(self::META_EARN_LEDGER_ID, $ledger_id);
                $order->save();
            }
            $order->add_order_note(sprintf(
                'RRR earn confirmed: %d points credited (request_id=%s).',
                (int) ($result['body']['points_credited'] ?? 0),
                $result['request_id'] ?? '-',
            ));
            return;
        }

        // Don't retry on 4xx — those are deterministic errors (e.g. 422
        // EARN_NOT_ALLOWED for a Diamond Concierge member). Mark the order as
        // permanently failed so subsequent status transitions don't re-fire,
        // and add a note. Background retries on 5xx are TODO (Action Scheduler).
        $http_code = (int) $result['http_code'];
        $is_permanent = ($http_code >= 400 && $http_code < 500);

        if ($is_permanent) {
            $order->update_meta_data(self::META_EARN_PERMANENT_FAILURE, wp_json_encode([
                'http_code'  => $http_code,
                'error_code' => $result['error_code'] ?? null,
                'request_id' => $result['request_id'] ?? null,
                'failed_at'  => gmdate('c'),
            ]));
            $order->save();
        }

        $order->add_order_note(sprintf(
            'RRR earn FAILED%s: http=%d code=%s request_id=%s',
            $is_permanent ? ' (permanent — will not retry)' : ' (transient — may retry)',
            $http_code,
            $result['error_code'] ?? '-',
            $result['request_id'] ?? '-',
        ));
    }

    /**
     * Build the user identifier sent to RRR. Format: "wp-user-<id>" so the
     * RRR side can distinguish across merchants without ambiguity.
     */
    private static function user_id_for_order(WC_Order $order): ?string {
        $wp_user_id = $order->get_user_id();
        if ($wp_user_id === 0) {
            return null;
        }
        return 'wp-user-' . (string) $wp_user_id;
    }

    /**
     * Apply a redeem at checkout. Called from the checkout handler in front-
     * end code (a separate template snippet or block — out of this file's
     * scope). Returns the same shape as RRR_Client::post.
     *
     * Caller is responsible for:
     *   - validating the points amount client-side against the tier cap
     *     (which the server will also enforce — never trust client-side alone)
     *   - persisting the META_REDEEM_KEY before the call
     *   - reading META_REDEEM_KEY on retry so the same key is reused
     */
    public static function apply_redeem(WC_Order $order, int $points_to_redeem): array {
        if ($points_to_redeem <= 0) {
            return [
                'ok'         => false,
                'http_code'  => 0,
                'body'       => null,
                'request_id' => null,
                'error_code' => 'CLIENT_VALIDATION',
            ];
        }

        // Skip if already redeemed against this order.
        if ($order->get_meta(self::META_REDEEM_LEDGER_ID) !== '') {
            return [
                'ok'         => true,
                'http_code'  => 200,
                'body'       => [
                    'idempotent_replay' => true,
                    'ledger_entry_id'   => $order->get_meta(self::META_REDEEM_LEDGER_ID),
                    'points_redeemed'   => (int) $order->get_meta(self::META_REDEEM_POINTS),
                ],
                'request_id' => null,
                'error_code' => null,
            ];
        }

        $user_id = self::user_id_for_order($order);
        if ($user_id === null) {
            return [
                'ok'         => false,
                'http_code'  => 0,
                'body'       => null,
                'request_id' => null,
                'error_code' => 'CLIENT_GUEST_CHECKOUT',
            ];
        }

        $idempotency_key = $order->get_meta(self::META_REDEEM_KEY);
        if ($idempotency_key === '') {
            $idempotency_key = RRR_Client::uuid_v4();
            $order->update_meta_data(self::META_REDEEM_KEY, $idempotency_key);
            $order->save();
        }

        $payload = [
            'tenant_id'         => RRR_Config::tenant_id(),
            'merchant_id'       => RRR_Config::tenant_id(),
            'user_id'           => $user_id,
            'points_to_redeem'  => $points_to_redeem,
            'transaction_value' => (float) $order->get_total(),
            'currency'          => $order->get_currency(),
            'reason_code'       => 'MERCHANT_ORDER_REDEMPTION',
            'external_ref'      => [
                'type' => 'wc_order',
                'id'   => (string) $order->get_id(),
            ],
        ];

        $result = RRR_Client::post('/redeem', $payload, $idempotency_key);

        if ($result['ok']) {
            $ledger_id = $result['body']['ledger_entry_id'] ?? '';
            $points_redeemed = (int) ($result['body']['points_redeemed'] ?? 0);
            if (is_string($ledger_id) && $ledger_id !== '') {
                $order->update_meta_data(self::META_REDEEM_LEDGER_ID, $ledger_id);
                $order->update_meta_data(self::META_REDEEM_POINTS, $points_redeemed);
                $order->save();
            }
        }

        return $result;
    }

    /**
     * Read the current member's wallet balance. Used by the checkout pre-flight
     * and the account-page display. Returns the parsed body on success or null
     * on failure (UI shows a graceful empty state instead of an error toast on
     * a read).
     */
    public static function read_balance(int $wp_user_id): ?array {
        if ($wp_user_id === 0) {
            return null;
        }
        $user_id = 'wp-user-' . (string) $wp_user_id;
        $result = RRR_Client::get('/wallets/' . rawurlencode($user_id) . '/balance');
        return $result['ok'] ? ($result['body'] ?? null) : null;
    }
}
