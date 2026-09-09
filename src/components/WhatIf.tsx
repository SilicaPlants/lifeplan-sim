import { yen } from '../lib/format';
import type { BasicInfo } from '../lib/types';

/** スライダーで動かせる項目（BasicInfo のうち数値のもの） */
type KnobKey =
  | 'investmentRate'
  | 'monthlyInvestment'
  | 'inflationRate'
  | 'raiseRate'
  | 'retireAge'
  | 'livingCost'
  | 'income'
  | 'spouseIncome';

interface Knob {
  key: KnobKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** 表示する小数桁 */
  digits: number;
  /** 配偶者がいないときは出さない、などの出し分け */
  show?: (info: BasicInfo) => boolean;
}

const KNOBS: Knob[] = [
  { key: 'investmentRate', label: '投資の想定利回り', unit: '%', min: 0, max: 10, step: 0.1, digits: 1 },
  { key: 'monthlyInvestment', label: '毎月の積立額', unit: '万円', min: 0, max: 30, step: 0.5, digits: 1 },
  { key: 'income', label: '本人の年収', unit: '万円', min: 0, max: 2000, step: 10, digits: 0 },
  {
    key: 'spouseIncome',
    label: '配偶者の年収',
    unit: '万円',
    min: 0,
    max: 2000,
    step: 10,
    digits: 0,
    show: (info) => info.hasSpouse,
  },
  { key: 'livingCost', label: '生活費（月）', unit: '万円', min: 5, max: 60, step: 0.5, digits: 1 },
  { key: 'retireAge', label: '退職する年齢', unit: '歳', min: 55, max: 75, step: 1, digits: 0 },
  { key: 'raiseRate', label: '昇給率', unit: '%', min: 0, max: 5, step: 0.1, digits: 1 },
  { key: 'inflationRate', label: '物価上昇率', unit: '%', min: 0, max: 5, step: 0.1, digits: 1 },
];

function show(n: number, digits: number): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

interface Props {
  info: BasicInfo;
  /** 動かす前の値。まだ触っていなければ null */
  baseline: BasicInfo | null;
  onChange: (next: BasicInfo) => void;
  onReset: () => void;
  /** 動かす前と後の 95 歳時点の総資産 */
  baseFinal: number | null;
  currentFinal: number;
}

export function WhatIf({ info, baseline, onChange, onReset, baseFinal, currentFinal }: Props) {
  const knobs = KNOBS.filter((k) => k.show?.(info) ?? true);
  const changed = baseline !== null && knobs.some((k) => info[k.key] !== baseline[k.key]);
  const delta = baseFinal === null ? 0 : currentFinal - baseFinal;

  return (
    <div className="whatif">
      <div className="whatif-head">
        <div>
          <div className="whatif-title">条件を動かして試す</div>
          <p className="whatif-note">
            動かすとグラフがその場で引き直されます。動かす前の線は点線で残るので、差がそのまま見えます。
          </p>
        </div>
        {changed && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            動かす前に戻す
          </button>
        )}
      </div>

      {changed && (
        <div className={`whatif-delta${delta < 0 ? ' is-down' : ''}`}>
          <span>95歳時点の総資産</span>
          <strong>
            {delta >= 0 ? '+' : '−'}
            {yen(Math.abs(delta))}
          </strong>
          <span className="whatif-delta-detail">
            {yen(baseFinal ?? 0)} → {yen(currentFinal)}
          </span>
        </div>
      )}

      <div className="whatif-knobs">
        {knobs.map((k) => {
          const value = info[k.key];
          const before = baseline?.[k.key] ?? value;
          const diff = value - before;
          // いまの値が既定の範囲より外なら、その値まで目盛りを広げる
          const min = Math.min(k.min, value, before);
          const max = Math.max(k.max, value, before);
          return (
            <label className="knob" key={k.key}>
              <span className="knob-head">
                <span className="knob-label">{k.label}</span>
                <span className="knob-value">
                  {show(value, k.digits)}
                  {k.unit}
                  {/* 増減そのものに良し悪しはないので、色は中立にしておく */}
                  {diff !== 0 && (
                    <em>
                      {diff > 0 ? '+' : '−'}
                      {show(Math.abs(diff), k.digits)}
                    </em>
                  )}
                </span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={k.step}
                value={value}
                aria-label={k.label}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  // 0.1 刻みの浮動小数の誤差を落とす
                  const rounded = Math.round(n / k.step) * k.step;
                  onChange({ ...info, [k.key]: Number(rounded.toFixed(2)) });
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
