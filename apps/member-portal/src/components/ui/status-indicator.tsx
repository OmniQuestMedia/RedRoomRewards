import type { StatusTone } from '../../lib/design-tokens';
import { STATUS_TONE_COLOR } from '../../lib/design-tokens';

export interface StatusIndicatorProps {
  tone: StatusTone;
  label: string;
  className?: string;
}

export function StatusIndicator({ tone, label, className = '' }: StatusIndicatorProps) {
  const color = STATUS_TONE_COLOR[tone];
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-medium ${className}`}
      role="status"
    >
      <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
