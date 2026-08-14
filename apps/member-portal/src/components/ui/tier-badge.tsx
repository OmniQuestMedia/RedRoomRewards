import type { TierKind } from '../../lib/design-tokens';
import { TIER_COLOR } from '../../lib/design-tokens';

export interface TierBadgeProps {
  tier: TierKind;
  label?: string;
  className?: string;
}

export function TierBadge({ tier, label, className = '' }: TierBadgeProps) {
  const color = TIER_COLOR[tier];
  const text = label ?? tier.charAt(0).toUpperCase() + tier.slice(1);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${className}`}
      style={{ borderColor: color, color }}
    >
      {text}
    </span>
  );
}
