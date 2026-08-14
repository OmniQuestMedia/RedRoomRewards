/**
 * OQMI fleet design tokens — RedRoomRewards member portal.
 * Phase 1 (2026-08-13).
 *
 * Brand primary for loyalty remains the red-desire ramp.
 * Aubergine + support colors align the portal with the wider OQMI fleet.
 */

export const RRR_BRAND = {
  'red-desire': '#C0392B',
  'red-passion': '#E74C3C',
  'red-obsession': '#922B21',
  'red-reign': '#641E16',
} as const;

export const OQMI_BRAND = {
  aubergine: { DEFAULT: '#8B0000', bright: '#B33A3A', deep: '#5C0000' },
} as const;

export const OQMI_SUPPORT = {
  slateGraphite: {
    100: '#F4F5F7',
    500: '#7B8794',
    700: '#52606D',
    900: '#1F2933',
  },
  champagneBronze: {
    DEFAULT: '#C9A86A',
    soft: '#FAE5B8',
    deep: '#8B6914',
  },
  neonCrimson: '#FF2D55',
  electricViolet: '#7C3AED',
  brightTeal: '#14B8A6',
} as const;

export const OQMI_SEMANTIC = {
  success: '#34C759',
  warning: '#F5A623',
  danger: '#FF3B3B',
  info: '#3A86FF',
  revenue: '#FF6B35',
} as const;

export type StatusTone = 'idle' | 'live' | 'pending' | 'success' | 'warning' | 'danger' | 'offline';

export const STATUS_TONE_COLOR: Record<StatusTone, string> = {
  idle: OQMI_SUPPORT.slateGraphite[500],
  live: OQMI_SEMANTIC.success,
  pending: OQMI_SEMANTIC.warning,
  success: OQMI_SEMANTIC.success,
  warning: OQMI_SEMANTIC.warning,
  danger: OQMI_SEMANTIC.danger,
  offline: OQMI_SUPPORT.slateGraphite[700],
};

/** Loyalty tiers used by earn/burn/redemption surfaces. */
export type TierKind = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export const TIER_COLOR: Record<TierKind, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: OQMI_SUPPORT.champagneBronze.DEFAULT,
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',
};
