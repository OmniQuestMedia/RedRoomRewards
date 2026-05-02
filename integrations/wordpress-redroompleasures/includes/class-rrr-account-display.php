<?php
/**
 * Account-page balance display.
 *
 * Renders a simple [rrr_balance] shortcode that fetches the current member's
 * RRR Points balance and renders it. Reads from RRR on every render — the
 * plugin holds no local balance state.
 *
 * Failure mode: on any error (network, 4xx, 5xx), the shortcode renders
 * nothing rather than throwing or showing a noisy error. The point is for a
 * member's account page to gracefully handle backend hiccups, not turn an
 * outage into a UI error.
 *
 * @package RedRoomRewards
 */

if (!defined('ABSPATH')) {
    exit;
}

final class RRR_Account_Display {
    public static function register(): void {
        add_shortcode('rrr_balance', [self::class, 'shortcode_balance']);
    }

    public static function shortcode_balance(): string {
        if (!is_user_logged_in()) {
            return '';
        }

        $wp_user_id = get_current_user_id();
        $balance = RRR_WooCommerce_Hooks::read_balance($wp_user_id);

        if (!is_array($balance)) {
            return ''; // graceful empty on read failure
        }

        $available = isset($balance['available']) ? (int) $balance['available'] : 0;
        $escrow    = isset($balance['escrow_total']) ? (int) $balance['escrow_total'] : 0;

        $html  = '<div class="rrr-balance" role="region" aria-label="Loyalty points balance">';
        $html .= '<div class="rrr-balance-available" aria-label="Available to redeem, ' . esc_attr((string) $available) . ' RRR Points">';
        $html .= '<span class="rrr-balance-amount">' . esc_html(number_format($available)) . '</span> ';
        $html .= '<span class="rrr-balance-unit">RRR Points</span>';
        $html .= '</div>';
        $html .= '<div class="rrr-balance-helper">available to redeem</div>';

        if ($escrow > 0) {
            $html .= '<div class="rrr-balance-escrow" aria-label="' . esc_attr((string) $escrow) . ' RRR Points held in escrow">';
            $html .= 'Held in escrow: ' . esc_html(number_format($escrow)) . ' pts';
            $html .= '</div>';
        }

        $html .= '</div>';
        return $html;
    }
}
