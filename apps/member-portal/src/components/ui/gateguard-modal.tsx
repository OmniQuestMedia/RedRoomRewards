'use client';

export interface GateGuardModalProps {
  open: boolean;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function GateGuardModal({
  open,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  dismissible = false,
  onDismiss,
}: GateGuardModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-red-obsession bg-red-reign p-6 text-white shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/85">{body}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {dismissible && onDismiss ? (
            <button type="button" onClick={onDismiss} className="rounded-lg border border-white/20 px-4 py-2 text-sm">
              Dismiss
            </button>
          ) : null}
          {secondaryLabel && onSecondary ? (
            <button type="button" onClick={onSecondary} className="rounded-lg border border-red-passion px-4 py-2 text-sm">
              {secondaryLabel}
            </button>
          ) : null}
          <button type="button" onClick={onPrimary} className="rounded-lg bg-red-passion px-4 py-2 text-sm font-semibold">
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
