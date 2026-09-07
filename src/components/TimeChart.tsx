import { useMemo, useRef, useState } from 'react';
import { axisLabel, yen } from '../lib/format';
import { copyBlobToClipboard, downloadBlob, svgToPngBlob } from '../lib/svgImage';
import type { YearRow } from '../lib/types';
import { useElementWidth } from './useElementWidth';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  /** その年の値。null を返すと線を途切れさせる（比較プランの範囲外など） */
  value: (r: YearRow) => number | null;
  /** 面積の淡い塗りを敷く（主役の系列に1つだけ） */
  area?: boolean;
  /** 破線で描く（比較用の系列） */
  dashed?: boolean;
}

interface Props {
  rows: YearRow[];
  series: ChartSeries[];
  height?: number;
  /** 残高がマイナスの領域をこの色で塗る */
  negativeFill?: string;
  /** ライフイベントの注釈線を表示する */
  showEvents?: boolean;
  hoverT: number | null;
  onHoverT: (t: number | null) => void;
  ariaLabel: string;
  /** 画像として書き出すときのファイル名（拡張子なし） */
  imageName?: string;
}

/** 目盛りを 1 / 2 / 2.5 / 5 の刻みに丸める */
function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || Math.abs(max) || 1;
  const rough = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, niceMin, niceMax };
}

const PAD = { top: 26, right: 18, bottom: 34, left: 58 };

export function TimeChart({
  rows,
  series,
  height = 300,
  negativeFill,
  showEvents = false,
  hoverT,
  onHoverT,
  ariaLabel,
  imageName = 'chart',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'copied' | 'saved' | 'error'>(
    'idle',
  );
  const width = useElementWidth(wrapRef);
  const [focused, setFocused] = useState(false);

  const innerW = Math.max(120, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = rows.length;

  const { scaleX, scaleY, ticks, zeroY, useOku } = useMemo(() => {
    const values = rows
      .flatMap((r) => series.map((s) => s.value(r)))
      .filter((v): v is number => v !== null);
    const rawMin = values.length > 0 ? Math.min(0, ...values) : 0;
    const rawMax = values.length > 0 ? Math.max(0, ...values) : 0;
    const { ticks: tk, niceMin, niceMax } = niceTicks(rawMin, rawMax, 5);
    const sx = (t: number) => PAD.left + (n <= 1 ? 0 : (t / (n - 1)) * innerW);
    const sy = (v: number) =>
      PAD.top + innerH - ((v - niceMin) / (niceMax - niceMin || 1)) * innerH;
    return {
      scaleX: sx,
      scaleY: sy,
      ticks: tk,
      zeroY: sy(0),
      useOku: Math.max(...tk.map(Math.abs)) >= 10000,
    };
  }, [rows, series, innerW, innerH, n]);

  const xTickIndexes = useMemo(() => {
    const target = Math.max(4, Math.min(8, Math.floor(innerW / 110)));
    const stepYears = Math.max(1, Math.ceil((n - 1) / target / 5) * 5);
    const out: number[] = [];
    for (let t = 0; t < n; t += stepYears) out.push(t);
    if (out[out.length - 1] !== n - 1) {
      // 末尾の目盛りが直前と近すぎるとラベルが重なるため、直前を落とす
      if (n - 1 - out[out.length - 1] < stepYears * 0.6) out.pop();
      out.push(n - 1);
    }
    return out;
  }, [n, innerW]);

  const paths = useMemo(
    () =>
      series.map((s) => {
        // 値のない年で線を切る
        let d = '';
        let drawing = false;
        rows.forEach((r) => {
          const v = s.value(r);
          if (v === null) {
            drawing = false;
            return;
          }
          d += `${drawing ? 'L' : 'M'}${scaleX(r.t)} ${scaleY(v)} `;
          drawing = true;
        });
        const first = s.value(rows[0]);
        const last = s.value(rows[n - 1]);
        const areaD =
          first === null || last === null
            ? ''
            : `M${scaleX(rows[0].t)} ${zeroY} ` +
              rows
                .map((r) => {
                  const v = s.value(r);
                  return v === null ? '' : `L${scaleX(r.t)} ${scaleY(v)}`;
                })
                .join(' ') +
              ` L${scaleX(rows[n - 1].t)} ${zeroY} Z`;
        return { ...s, d: d.trim(), areaD };
      }),
    [rows, series, scaleX, scaleY, zeroY, n],
  );

  const eventMarks = useMemo(() => {
    if (!showEvents) return [];
    const marks: { t: number; x: number; label: string; row: number }[] = [];
    // 段ごとに直前のラベルの右端を覚えておき、空いている段に置く
    const laneRight = [-Infinity, -Infinity, -Infinity];
    rows.forEach((r) => {
      if (r.events.length === 0) return;
      const label = r.events[0];
      const x = scaleX(r.t);
      const w = label.length * 10 + 16;
      const lane = laneRight.findIndex((right) => x - w / 2 > right);
      // どの段にも入らないほど密集している年はラベルを省く（値は表とツールチップで確認できる）
      if (lane === -1) return;
      laneRight[lane] = x + w / 2;
      marks.push({ t: r.t, x, label, row: lane });
    });
    return marks;
  }, [rows, scaleX, showEvents]);

  const activeT = hoverT !== null && hoverT >= 0 && hoverT < n ? hoverT : null;
  const active = activeT !== null ? rows[activeT] : null;

  const handleMove = (e: { clientX: number; currentTarget: SVGSVGElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    const t = Math.round((x / innerW) * (n - 1));
    onHoverT(Math.max(0, Math.min(n - 1, t)));
  };

  const handleKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const base = activeT ?? 0;
    onHoverT(Math.max(0, Math.min(n - 1, base + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  const tooltipLeft = active
    ? Math.min(Math.max(scaleX(active.t) + 14, 8), Math.max(8, width - 196))
    : 0;

  const handleCopy = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setCopyState('busy');
    // ツールチップやクロスヘアは画像に残さない
    onHoverT(null);
    try {
      await new Promise((r) => window.setTimeout(r, 40));
      const blob = await svgToPngBlob(svg);
      if (await copyBlobToClipboard(blob)) {
        setCopyState('copied');
      } else {
        // クリップボードが使えない環境ではファイルとして保存する
        const result = await downloadBlob(blob, `${imageName}.png`);
        setCopyState(result === 'saved' ? 'saved' : 'idle');
      }
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 2400);
  };

  const copyLabel =
    copyState === 'busy'
      ? '作成中…'
      : copyState === 'copied'
        ? 'コピーしました'
        : copyState === 'saved'
          ? '画像を保存しました'
          : copyState === 'error'
            ? 'コピーできませんでした'
            : '画像としてコピー';

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`chart-copy${copyState === 'idle' ? '' : ' is-active'}`}
        onClick={handleCopy}
        disabled={copyState === 'busy'}
      >
        {copyLabel}
      </button>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        style={{ display: 'block', outline: 'none', touchAction: 'none' }}
        onPointerMove={handleMove}
        onMouseMove={handleMove}
        onPointerLeave={() => onHoverT(null)}
        onMouseLeave={() => onHoverT(null)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onHoverT(null);
        }}
      >
        {focused && (
          <rect
            x={1}
            y={1}
            width={Math.max(0, width - 2)}
            height={height - 2}
            rx={8}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
          />
        )}

        {/* Y 軸グリッド */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={scaleY(v)}
              y2={scaleY(v)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={scaleY(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--text-muted)"
            >
              {axisLabel(v, useOku)}
            </text>
          </g>
        ))}
        <text x={4} y={PAD.top - 12} fontSize={11} fill="var(--text-muted)">
          {useOku ? '億円' : '万円'}
        </text>

        {/* X 軸 */}
        {xTickIndexes.map((t) => (
          <text
            key={t}
            x={scaleX(t)}
            y={height - 12}
            textAnchor={t === 0 ? 'start' : t === n - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--text-muted)"
          >
            {rows[t].year}年 · {rows[t].age}歳
          </text>
        ))}

        {/* 面積 */}
        {paths
          .filter((p) => p.area)
          .map((p) => (
            <g key={`area-${p.id}`}>
              <clipPath id={`clip-pos-${p.id}`}>
                <rect x={PAD.left} y={PAD.top} width={innerW} height={Math.max(0, zeroY - PAD.top)} />
              </clipPath>
              <path d={p.areaD} fill={p.color} opacity={0.12} clipPath={`url(#clip-pos-${p.id})`} />
              {negativeFill && (
                <>
                  <clipPath id={`clip-neg-${p.id}`}>
                    <rect
                      x={PAD.left}
                      y={zeroY}
                      width={innerW}
                      height={Math.max(0, PAD.top + innerH - zeroY)}
                    />
                  </clipPath>
                  <path
                    d={p.areaD}
                    fill={negativeFill}
                    opacity={0.18}
                    clipPath={`url(#clip-neg-${p.id})`}
                  />
                </>
              )}
            </g>
          ))}

        {/* ゼロ線 */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />

        {/* イベント注釈 */}
        {eventMarks.map((m) => (
          <g key={`ev-${m.t}`}>
            <line
              x1={m.x}
              x2={m.x}
              y1={PAD.top + m.row * 13}
              y2={PAD.top + innerH}
              stroke="var(--border-strong)"
              strokeWidth={1}
              opacity={0.7}
            />
            <text
              x={m.x}
              y={PAD.top - 4 + m.row * 13}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-muted)"
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* 折れ線 */}
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeDasharray={p.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* クロスヘア */}
        {active && (
          <g>
            <line
              x1={scaleX(active.t)}
              x2={scaleX(active.t)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            {series.map((s) => {
              const v = s.value(active);
              if (v === null) return null;
              return (
                <circle
                  key={s.id}
                  cx={scaleX(active.t)}
                  cy={scaleY(v)}
                  r={4.5}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}

        {/* 末端の値ラベル（主役の系列のみ） */}
        {series.length === 1 && series[0].value(rows[n - 1]) !== null && (
          <text
            x={scaleX(rows[n - 1].t)}
            y={scaleY(series[0].value(rows[n - 1]) as number) - 12}
            textAnchor="end"
            fontSize={12}
            fontWeight={700}
            fill="var(--text-primary)"
          >
            {yen(series[0].value(rows[n - 1]) as number)}
          </text>
        )}
      </svg>

      {active && (
        <div className="chart-tooltip" style={{ left: tooltipLeft, top: 8 }}>
          <div className="tt-head">
            {active.year}年 · {active.age}歳
          </div>
          {series.map((s) => {
            const v = s.value(active);
            return (
              <div className="tt-row" key={s.id}>
                <span className="tt-key">
                  <span className="tt-line" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tt-val">{v === null ? '—' : yen(v)}</span>
              </div>
            );
          })}
          {active.events.length > 0 && <div className="tt-events">{active.events.join(' / ')}</div>}
        </div>
      )}
    </div>
  );
}
