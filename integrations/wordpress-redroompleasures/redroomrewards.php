<?php
/**
 * Plugin Name: RedRoomRewards (RedRoomPleasures)
 * Plugin URI:  https://github.com/OmniQuestMedia/RedRoomRewards
 * Description: Loyalty-points integration for the RedRoomPleasures storefront. Bridges WooCommerce to the RRR loyalty engine via HMAC-signed service-to-service requests.
 * Version:     0.1.0-alpha
 * Requires PHP: 8.1
 * Requires at least: 6.4
 * License:     UNLICENSED — OmniQuest Media Inc. internal use only
 *
 * @package RedRoomRewards
 *
 * Authority:
 *   docs/AUTH_CONTRACT.md           — HMAC envelope spec
 *   docs/UX_INTEGRATION_BRIEF.md    — error codes, idempotency, rate-limits
 *   docs/integrations/redroompleasures-wordpress.md — what this plugin must do
 *
 * On any conflict between this code and those docs, the docs win and the
 * code gets a fix.
 *
 * Configuration is read from wp-config.php constants (NEVER from the WP options
 * table — secrets do not belong in the database):
 *
 *   define('RRR_API_KEY_ID',   'rrp-key-2026-01');
 *   define('RRR_API_SECRET',   getenv('RRR_API_SECRET'));      // server env
 *   define('RRR_API_BASE',     'https://api-staging.redroomrewards.com/api/v1');
 *   define('RRR_WEBHOOK_URL',  'https://www.redroompleasures.com/wp-json/rrr/v1/webhook');
 *   define('RRR_TENANT_ID',    'redroompleasures');
 *
 * The plugin refuses to bootstrap if any required constant is missing or if
 * RRR_API_BASE is non-HTTPS (other than localhost for dev).
 */

if (!defined('ABSPATH')) {
    exit; // No direct access.
}

define('RRR_PLUGIN_VERSION', '0.1.0-alpha');
define('RRR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('RRR_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once RRR_PLUGIN_DIR . 'includes/class-rrr-config.php';
require_once RRR_PLUGIN_DIR . 'includes/class-rrr-client.php';
require_once RRR_PLUGIN_DIR . 'includes/class-rrr-woocommerce-hooks.php';
require_once RRR_PLUGIN_DIR . 'includes/class-rrr-webhook-handler.php';
require_once RRR_PLUGIN_DIR . 'includes/class-rrr-account-display.php';

/**
 * Bootstrap the plugin once all WP / WooCommerce dependencies are loaded.
 *
 * Refuses to bootstrap on misconfiguration. The admin-notice flow is the
 * only side effect; nothing is wired to WC or REST hooks if config is bad.
 */
function rrr_bootstrap(): void {
    $config_check = RRR_Config::validate();
    if (is_wp_error($config_check)) {
        add_action('admin_notices', static function () use ($config_check): void {
            $msg = esc_html($config_check->get_error_message());
            echo '<div class="notice notice-error"><p><strong>RedRoomRewards:</strong> ' . $msg . '</p></div>';
        });
        return;
    }

    // WooCommerce hooks (earn-on-purchase, redeem-at-checkout).
    if (class_exists('WooCommerce')) {
        RRR_WooCommerce_Hooks::register();
    }

    // REST endpoint for inbound webhooks.
    add_action('rest_api_init', [RRR_Webhook_Handler::class, 'register_route']);

    // Account-page balance display.
    RRR_Account_Display::register();
}
add_action('plugins_loaded', 'rrr_bootstrap', 20);

/**
 * Activation hook: flush rewrite rules so the /wp-json/rrr/v1/webhook route
 * is reachable immediately. Does NOT seed any data; the plugin holds no
 * local balance state — it always reads from RRR.
 */
register_activation_hook(__FILE__, static function (): void {
    flush_rewrite_rules();
});

register_deactivation_hook(__FILE__, static function (): void {
    flush_rewrite_rules();
});
