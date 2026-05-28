import type { Expiry } from "../lib/api";

interface ExpirySelectorProps {
  expiries: Expiry[];
  value: string | null;
  onChange: (expiryCode: string) => void;
  disabled?: boolean;
}

export default function ExpirySelector({
  expiries,
  value,
  onChange,
  disabled,
}: ExpirySelectorProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral">
      <span>Expiry</span>
      <select
        className="rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 font-mono text-text outline-none focus:border-green disabled:opacity-50"
        value={value ?? ""}
        disabled={disabled || expiries.length === 0}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select expiry"
      >
        {expiries.length === 0 && <option value="">—</option>}
        {expiries.map((ex) => (
          <option key={ex.expiry_code} value={ex.expiry_code}>
            {ex.expiry_code}
          </option>
        ))}
      </select>
    </label>
  );
}
