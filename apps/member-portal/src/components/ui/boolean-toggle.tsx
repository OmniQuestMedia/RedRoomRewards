'use client';

export interface BooleanToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function BooleanToggle({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: BooleanToggleProps) {
  const toggleId = id ?? `toggle-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={toggleId} className={`inline-flex cursor-pointer items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-red-passion' : 'bg-red-reign'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm">{label}</span>
    </label>
  );
}
