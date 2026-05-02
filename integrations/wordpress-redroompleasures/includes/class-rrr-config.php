<?php
/**
 * Configuration helper. Reads required values from wp-config.php constants,
 * validates them, and exposes them as a single object for the rest of the
 * plugin.
 *
 * Secrets MUST come from constants (or server env vars surfaced via getenv()
 * inside wp-config.php). Never from the WordPress options table.
 *
 * @package RedRoomRewards
 */

if (!defined('ABSPATH')) {
    exit;
}

final class RRR_Config {
    public const REQUIRED_CONSTANTS = [
        'RRR_API_KEY_ID',
        'RRR_API_SECRET',
        'RRR_API_BASE',
        'RRR_WEBHOOK_URL',
        'RRR_TENANT_ID',
    ];

    /**
     * Validates that all required constants are defined and well-formed.
     *
     * Returns true on success, WP_Error on failure with a human-readable
     * message describing the misconfiguration. The caller is expected to
     * surface the error via admin_notices and refuse to wire any hooks.
     */
    public static function validate() {
        foreach (self::REQUIRED_CONSTANTS as $name) {
            if (!defined($name)) {
                return new WP_Error(
                    'rrr_config_missing',
                    sprintf('Missing required constant %s in wp-config.php.', $name),
                );
            }
            $value = constant($name);
            if (!is_string($value) || trim($value) === '') {
                return new WP_Error(
                    'rrr_config_empty',
                    sprintf('Constant %s must be a non-empty string.', $name),
                );
            }
        }

        $base = constant('RRR_API_BASE');
        if (!self::is_https_or_localhost($base)) {
            return new WP_Error(
                'rrr_config_insecure',
                'RRR_API_BASE must use HTTPS (or localhost for development).',
            );
        }

        $webhook = constant('RRR_WEBHOOK_URL');
        if (!self::is_https_or_localhost($webhook)) {
            return new WP_Error(
                'rrr_config_insecure',
                'RRR_WEBHOOK_URL must use HTTPS (or localhost for development).',
            );
        }

        $secret = constant('RRR_API_SECRET');
        if (strlen($secret) < 32) {
            return new WP_Error(
                'rrr_config_weak_secret',
                'RRR_API_SECRET must be at least 32 characters (256 bits hex).',
            );
        }

        return true;
    }

    public static function api_base(): string {
        return rtrim(constant('RRR_API_BASE'), '/');
    }

    public static function api_key_id(): string {
        return constant('RRR_API_KEY_ID');
    }

    public static function api_secret(): string {
        return constant('RRR_API_SECRET');
    }

    public static function tenant_id(): string {
        return constant('RRR_TENANT_ID');
    }

    public static function webhook_url(): string {
        return constant('RRR_WEBHOOK_URL');
    }

    private static function is_https_or_localhost(string $url): bool {
        if (str_starts_with($url, 'https://')) {
            return true;
        }
        // Allow http://localhost and http://127.0.0.1 for local dev only.
        if (preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?(/|$)#i', $url) === 1) {
            return true;
        }
        return false;
    }
}
