/** 万円単位の数値を「1億2,340万円」のように整形する */
export function yen(man: number): string {
  const sign = man < 0 ? '−' : '';
  const v = Math.round(Math.abs(man));
  if (v >= 10000) {
    const oku = Math.floor(v / 10000);
    const rest = v % 10000;
    return `${sign}${oku}億${rest > 0 ? `${rest.toLocaleString('ja-JP')}万` : ''}円`;
  }
  return `${sign}${v.toLocaleString('ja-JP')}万円`;
}

/** 軸ラベル用の短い表記 */
export function yenShort(man: number): string {
  const sign = man < 0 ? '−' : '';
  const v = Math.abs(man);
  if (v >= 10000) return `${sign}${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}億`;
  return `${sign}${Math.round(v).toLocaleString('ja-JP')}`;
}

export function pct(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`;
}

/** 軸の目盛りラベル。1億を超えるスケールでは全目盛りを億表記に統一する */
export function axisLabel(man: number, useOku: boolean): string {
  if (man === 0) return '0';
  const sign = man < 0 ? '−' : '';
  const v = Math.abs(man);
  if (useOku) {
    const oku = v / 10000;
    return `${sign}${oku % 1 === 0 ? oku : oku.toFixed(1)}`;
  }
  return `${sign}${Math.round(v).toLocaleString('ja-JP')}`;
}
