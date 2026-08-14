import type { TierKind } from '../../lib/design-tokens';
import { TIER_COLOR, TIER_LABEL } from '../../lib/design-tokens';

export interface TierBadgeProps {
  tier: TierKind;
  label?: string;
  className?: string;
}

const BASE =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 ' +
  'text-xs font-semibold uppercase tracking-wide';

export function TierBadge({ tier, label, className = '' }: TierBadgeProps) {
  const color = TIER_COLOR[tier];
  const text = label ?? TIER_LABEL[tier];
  return (
    <span className={`${BASE} ${className}`} style={{ borderColor: color, color }}>
      {text}
    </span>
  );
}
