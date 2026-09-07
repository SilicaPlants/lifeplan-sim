import { useEffect, useState, type ReactNode } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * 数値入力。入力中は空欄をそのまま保てるようにして、
 * 「いったん消してから打ち直す」操作で 0 が残らないようにしている。
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  ariaLabel,
  className,
}: NumberInputProps) {
  const [text, setText] = useState(() => String(value));
  const [editing, setEditing] = useState(false);

  // 外から値が変わったときは表示を合わせる（入力中は邪魔しない）
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="number"
      className={className}
      value={text}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setEditing(true);
        e.target.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '' || raw === '-') return;
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      onBlur={() => {
        setEditing(false);
        setText(String(value));
      }}
    />
  );
}

interface NumberFieldProps {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  desc?: string;
}

export function NumberField({
  label,
  unit,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  hint,
  desc,
}: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <span className="input-wrap">
        <NumberInput value={value} onChange={onChange} min={min} max={max} step={step} />
        {unit && <span className="input-unit">{unit}</span>}
      </span>
      {desc && <span className="field-desc">{desc}</span>}
    </label>
  );
}

interface ToggleFieldProps<T extends string | number | boolean> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  desc?: string;
}

export function ToggleField<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  desc,
}: ToggleFieldProps<T>) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="toggle-group">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`toggle${o.value === value ? ' is-on' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {desc && <span className="field-desc">{desc}</span>}
    </div>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}
