import { useEffect, useMemo, useRef, useState } from 'react';
import { yen } from '../lib/format';
import { buildKnobs, loadKnobIds, saveKnobIds, type Knob, type Scenario } from '../lib/knobs';

function show(n: number, digits: number): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 0.1 刻みなどの浮動小数の誤差を落とす */
function tidy(v: number, step: number): number {
  return Number((Math.round(v / step) * step).toFixed(4));
}

interface RowProps {
  knob: Knob;
  scenario: Scenario;
  baseline: Scenario | null;
  onChange: (next: Scenario) => void;
}

function KnobRow({ knob, scenario, baseline, onChange }: RowProps) {
  const value = knob.get(scenario);
  const before = baseline ? knob.get(baseline) : value;
  const diff = value - before;
  // 数値を打っている途中は文字列のまま持ち、確定したときに反映する
  const [typing, setTyping] = useState<string | null>(null);

  const commit = (v: number) => {
    if (!Number.isFinite(v)) return;
    onChange(knob.set(scenario, tidy(Math.max(knob.min === 0 ? 0 : -Infinity, v), knob.step)));
  };

  // スライダーの目盛りは、いまの値や動かす前の値が外にあればそこまで広げる
  const min = Math.min(knob.min, value, before);
  const max = Math.max(knob.max, value, before);

  return (
    <div className="knob">
      <div className="knob-head">
        <span className="knob-label">{knob.label}</span>
        {/* 差がないときも高さを保つため、中身だけ空にして場所は残す */}
        <span className="knob-diff">
          {diff === 0 ? '' : `${diff > 0 ? '+' : '−'}${show(Math.abs(diff), knob.digits)}`}
        </span>
      </div>
      <div className="knob-input-row">
        <button
          type="button"
          className="knob-step"
          aria-label={`${knob.label}を減らす`}
          onClick={() => commit(value - knob.step)}
        >
          −
        </button>
        <input
          type="number"
          className="knob-number"
          inputMode="decimal"
          step={knob.step}
          value={typing ?? show(value, knob.digits).replace(/,/g, '')}
          aria-label={knob.label}
          onChange={(e) => {
            setTyping(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) commit(n);
          }}
          onBlur={() => setTyping(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className="knob-step"
          aria-label={`${knob.label}を増やす`}
          onClick={() => commit(value + knob.step)}
        >
          ＋
        </button>
        <span className="knob-unit">{knob.unit}</span>
      </div>
      <input
        type="range"
        className="knob-range"
        min={min}
        max={max}
        step={knob.step}
        value={value}
        aria-label={`${knob.label}のスライダー`}
        onChange={(e) => commit(Number(e.target.value))}
      />
    </div>
  );
}

interface Props {
  scenario: Scenario;
  /** 動かす前の条件。まだ触っていなければ null */
  baseline: Scenario | null;
  onChange: (next: Scenario) => void;
  onReset: () => void;
  /** 動かす前と後の 95 歳時点の総資産 */
  baseFinal: number | null;
  currentFinal: number;
}

export function WhatIf({ scenario, baseline, onChange, onReset, baseFinal, currentFinal }: Props) {
  const all = useMemo(() => buildKnobs(scenario), [scenario]);
  const [ids, setIds] = useState<string[]>(() => loadKnobIds());
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // 選んだ順ではなく、候補の並び順で出す
  const shown = all.filter((k) => ids.includes(k.id));
  const changed = baseline !== null;
  const delta = baseFinal === null ? 0 : currentFinal - baseFinal;

  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    saveKnobIds(next);
  };

  // 選ぶ画面は見出しごとにまとめる
  const groups: { name: string; knobs: Knob[] }[] = [];
  all.forEach((k) => {
    const g = groups.find((x) => x.name === k.group);
    if (g) g.knobs.push(k);
    else groups.push({ name: k.group, knobs: [k] });
  });

  return (
    <div className="whatif">
      <div className="whatif-head">
        <div>
          <div className="whatif-title">条件を動かして試す</div>
          <p className="whatif-note">
            スライダー・数値の入力・＋−のどれでも動かせます。動かす前の線は点線で残ります。
          </p>
        </div>
        <div className="whatif-actions">
          <div className="picker-wrap" ref={pickerRef}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((v) => !v)}
            >
              項目を選ぶ（{shown.length}）
            </button>
            {pickerOpen && (
              <div className="picker">
                {groups.map((g) => (
                  <div className="picker-group" key={g.name}>
                    <div className="picker-group-name">{g.name}</div>
                    {g.knobs.map((k) => (
                      <label className="picker-item" key={k.id}>
                        <input type="checkbox" checked={ids.includes(k.id)} onChange={() => toggle(k.id)} />
                        <span>{k.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!changed} onClick={onReset}>
            動かす前に戻す
          </button>
        </div>
      </div>

      {/* 出したり消したりすると下のつまみがずれるので、行はいつも置いておく */}
      <div className={`whatif-delta${!changed ? ' is-idle' : delta < 0 ? ' is-down' : ''}`}>
        {changed ? (
          <>
            <span>95歳時点の総資産</span>
            <strong>
              {delta >= 0 ? '+' : '−'}
              {yen(Math.abs(delta))}
            </strong>
            <span className="whatif-delta-detail">
              {yen(baseFinal ?? 0)} → {yen(currentFinal)}
            </span>
          </>
        ) : (
          <span>動かすと、95歳時点の総資産がいくら変わるかをここに出します。</span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="field-desc" style={{ marginTop: 16 }}>
          「項目を選ぶ」から、動かしたい条件を選んでください。
        </p>
      ) : (
        <div className="whatif-knobs">
          {shown.map((k) => (
            <KnobRow key={k.id} knob={k} scenario={scenario} baseline={baseline} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}
