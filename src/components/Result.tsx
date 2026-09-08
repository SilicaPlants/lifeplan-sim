import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAdvice } from '../lib/advice';
import { canSaveFiles } from '../lib/download';
import { downloadLifePlanExcel } from '../lib/excel';
import { yen, yenFine } from '../lib/format';
import { simulate } from '../lib/simulate';
import { loadPlans, type SavedPlan } from '../lib/storage';
import type { BasicInfo, PlanAnswers, YearRow } from '../lib/types';
import { TimeChart, type ChartSeries } from './TimeChart';

interface Props {
  info: BasicInfo;
  answers: PlanAnswers;
  onBack: () => void;
  onRestart: () => void;
  onSave: () => void;
  /** 保存したプランをこの画面で読み込む */
  onLoadPlan: (plan: SavedPlan) => void;
  /** いま開いているプランの id（あれば） */
  currentPlanId: string | null;
}

/** 比較プランに割り当てる色（現在の条件は series-1） */
const COMPARE_COLORS = ['var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

const ICON: Record<string, string> = {
  critical: '!',
  warning: '!',
  good: '✓',
  info: 'i',
};

export function Result({
  info,
  answers,
  onBack,
  onRestart,
  onSave,
  onLoadPlan,
  currentPlanId,
}: Props) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [canSave, setCanSave] = useState(true);
  useEffect(() => {
    void canSaveFiles().then(setCanSave);
  }, []);

  const result = useMemo(() => simulate(info, answers), [info, answers]);
  const advice = useMemo(() => buildAdvice(info, answers, result), [info, answers, result]);

  // ---- 保存したプランとの比較 ----
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const planMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPlans(loadPlans()), []);

  // 保存プランの一覧は、モーダルで増減したあとも開くたびに読み直す
  useEffect(() => {
    if (planMenuOpen) setPlans(loadPlans());
  }, [planMenuOpen]);

  // メニューの外side をクリック、または Esc で閉じる
  useEffect(() => {
    if (!planMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!planMenuRef.current?.contains(e.target as Node)) setPlanMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlanMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [planMenuOpen]);

  // メニューに出す各プランの指標
  const planMetrics = useMemo(() => {
    const map = new Map<string, { final: number; depletionYear: number | null }>();
    plans.forEach((p) => {
      try {
        const r = simulate(p.info, p.answers);
        map.set(p.id, { final: r.final.totalAssets, depletionYear: r.depletion?.year ?? null });
      } catch {
        // 壊れたデータは指標なしで一覧に出す
      }
    });
    return map;
  }, [plans]);

  const comparisons = useMemo(
    () =>
      compareIds
        .map((id) => plans.find((p) => p.id === id))
        .filter((p): p is SavedPlan => p !== undefined)
        .map((plan, i) => ({
          plan,
          color: COMPARE_COLORS[i % COMPARE_COLORS.length],
          result: simulate(plan.info, plan.answers),
        })),
    [compareIds, plans],
  );

  const toggleCompare = (id: string) =>
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= COMPARE_COLORS.length
          ? prev
          : [...prev, id],
    );

  const totalSeries: ChartSeries[] = [
    {
      id: 'total',
      label: comparisons.length > 0 ? 'いまの条件' : '総資産',
      color: 'var(--series-1)',
      value: (r: YearRow) => r.totalAssets,
      area: comparisons.length === 0,
    },
    // 比較プランは西暦をそろえて重ねる（期間外の年は線を切る）
    ...comparisons.map((c) => {
      const byYear = new Map(c.result.rows.map((r) => [r.year, r.totalAssets]));
      return {
        id: c.plan.id,
        label: c.plan.name,
        color: c.color,
        dashed: true,
        value: (r: YearRow) => byYear.get(r.year) ?? null,
      };
    }),
  ];

  const assetSeries: ChartSeries[] = [
    { id: 'cash', label: '現金・預金', color: 'var(--series-1)', value: (r) => r.cash },
    { id: 'investments', label: '投資資産', color: 'var(--series-3)', value: (r) => r.investments },
  ];

  const cashflowSeries: ChartSeries[] = [
    {
      id: 'income',
      label: '収入（手取り）',
      color: 'var(--series-1)',
      value: (r) => r.income - r.lumpIncome,
    },
    {
      id: 'expense',
      label: '支出',
      color: 'var(--series-2)',
      value: (r) => r.expense - r.lumpExpense - r.bigExpense,
    },
  ];

  const { depletion, minRow, atRetirement, final } = result;
  const totalGain = result.rows.reduce((s, r) => s + r.investmentGain, 0);
  const totalInterest = result.rows.reduce((s, r) => s + r.cashInterest, 0);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const result = await downloadLifePlanExcel({ info, answers });
      if (result === 'declined') setExportError('保存をキャンセルしました');
      else if (result === 'failed') setExportError('保存できませんでした');
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Excel の作成に失敗しました');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="page-head page-head-row">
        <div>
          <h2>シミュレーション結果</h2>
          <p>
            今年から95歳まで、1年ずつ計算しました。グラフの上にカーソルを置くか、左右キーを押すと各年の内訳が出ます。
          </p>
        </div>
        <div className="head-actions">
          <div className="head-buttons">
            <button type="button" className="btn btn-ghost" onClick={onRestart}>
              最初からやり直す
            </button>
            <button type="button" className="btn btn-ghost" onClick={onSave}>
              この結果を保存
            </button>
            <div className="plan-menu-wrap" ref={planMenuRef}>
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={planMenuOpen}
                aria-haspopup="menu"
                disabled={plans.length === 0}
                title={plans.length === 0 ? 'まだ保存したプランがありません' : undefined}
                onClick={() => setPlanMenuOpen((v) => !v)}
              >
                保存したプランを開く{plans.length > 0 ? `（${plans.length}）` : ''} ▾
              </button>
              {planMenuOpen && (
                <div className="plan-menu" role="menu">
                  {plans.map((p) => {
                    const m = planMetrics.get(p.id);
                    const isCurrent = p.id === currentPlanId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="menuitem"
                        className="plan-menu-item"
                        disabled={isCurrent}
                        onClick={() => {
                          onLoadPlan(p);
                          setCompareIds((prev) => prev.filter((x) => x !== p.id));
                          setPlanMenuOpen(false);
                        }}
                      >
                        <span className="plan-menu-name">
                          {p.name}
                          {isCurrent && <em>表示中</em>}
                        </span>
                        <span className="plan-menu-meta">
                          {m ? `95歳 ${yen(m.final)}` : '—'}
                          {m?.depletionYear ? ` · ${m.depletionYear}年にショート` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              ← 条件を変えて試す
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting || !canSave}
              title={canSave ? undefined : 'この共有ページではファイルを保存できません'}
            >
              {exporting ? '作成中…' : 'Excel をダウンロード'}
            </button>
          </div>
          <span className="field-desc">
            {canSave
              ? '計算式入りの xlsx（INPUT／計算／結果）'
              : 'この共有ページではファイルを保存できません'}
          </span>
          {exportError && <span className="export-error">{exportError}</span>}
        </div>
      </div>

      <div className="hero-row">
        <div className="stat">
          <div className="stat-label">95歳時点の総資産</div>
          <div className={`stat-value${final.totalAssets < 0 ? ' is-critical' : ''}`}>
            {yen(final.totalAssets)}
          </div>
          <div className="stat-sub">
            現金 {yen(final.cash)} ／ 投資 {yen(final.investments)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">退職時（{info.retireAge}歳）の総資産</div>
          <div className="stat-value">{atRetirement ? yen(atRetirement.totalAssets) : '—'}</div>
          <div className="stat-sub">退職金 {yen(info.retirementPay)} を含む</div>
        </div>
        <div className="stat">
          <div className="stat-label">総資産が最も少なくなる時期</div>
          <div className={`stat-value${minRow.totalAssets < 0 ? ' is-critical' : ''}`}>
            {yen(minRow.totalAssets)}
          </div>
          <div className="stat-sub">
            {minRow.year}年 · {minRow.age}歳
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">生涯の運用益</div>
          <div className="stat-value">{yen(totalGain)}</div>
          <div className="stat-sub">
            投資利回り{info.investmentRate}% ／ 預金利息は {yen(totalInterest)}
          </div>
        </div>
      </div>

      <section className="card">
        <div className="card-title">総資産の推移</div>
        <p className="card-note">
          年末時点の現金と投資の合計です。縦線はライフイベントのあった年を示します。
          {depletion && ` ${depletion.year}年に資金がショートします。`}
        </p>

        {plans.length > 0 ? (
          <div className="compare-bar">
            <span className="compare-bar-label">保存したプランと比較</span>
            {plans.slice(0, 12).map((p) => {
              const index = compareIds.indexOf(p.id);
              const on = index >= 0;
              const full = !on && compareIds.length >= COMPARE_COLORS.length;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`compare-chip${on ? ' is-on' : ''}`}
                  style={on ? { color: COMPARE_COLORS[index % COMPARE_COLORS.length] } : undefined}
                  disabled={full}
                  title={full ? `比較できるのは${COMPARE_COLORS.length}件までです` : undefined}
                  onClick={() => toggleCompare(p.id)}
                >
                  {on && <span className="swatch" />}
                  {p.name}
                </button>
              );
            })}
            {compareIds.length > 0 && (
              <button type="button" className="link-btn" onClick={() => setCompareIds([])}>
                比較をやめる
              </button>
            )}
          </div>
        ) : (
          <p className="field-desc" style={{ marginBottom: 12 }}>
            条件を変えたプランを保存しておくと、ここに並べて重ねられます。
          </p>
        )}

        {comparisons.length > 0 && (
          <div className="legend">
            {totalSeries.map((s) => (
              <span className="legend-item" key={s.id}>
                <span
                  className="tt-line"
                  style={{
                    background: s.color,
                    width: 16,
                    height: 2,
                    opacity: s.dashed ? 0.85 : 1,
                  }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}

        <TimeChart
          rows={result.rows}
          series={totalSeries}
          height={320}
          negativeFill={comparisons.length === 0 ? 'var(--critical)' : undefined}
          showEvents={comparisons.length === 0}
          hoverT={hoverT}
          onHoverT={setHoverT}
          ariaLabel="総資産の推移グラフ"
          imageName="総資産の推移"
        />

        {comparisons.length > 0 && (
          <div className="table-scroll compare-table" style={{ maxHeight: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>プラン</th>
                  <th>最終年の総資産</th>
                  <th>退職時の総資産</th>
                  <th>最も少ない残高</th>
                  <th>資金ショート</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span
                      className="tt-line"
                      style={{ background: 'var(--series-1)', width: 14, height: 3 }}
                    />
                    いまの条件
                  </td>
                  <td>{yen(final.totalAssets)}</td>
                  <td>{atRetirement ? yen(atRetirement.totalAssets) : '—'}</td>
                  <td className={minRow.totalAssets < 0 ? 'is-negative' : undefined}>
                    {yen(minRow.totalAssets)}
                  </td>
                  <td className={depletion ? 'is-negative' : undefined}>
                    {depletion ? `${depletion.year}年` : 'なし'}
                  </td>
                </tr>
                {comparisons.map((c) => {
                  const diff = c.result.final.totalAssets - final.totalAssets;
                  return (
                    <tr key={c.plan.id}>
                      <td>
                        <span
                          className="tt-line"
                          style={{ background: c.color, width: 14, height: 3 }}
                        />
                        {c.plan.name}
                      </td>
                      <td>
                        {yen(c.result.final.totalAssets)}
                        <span className={`compare-diff${diff >= 0 ? ' is-up' : ' is-down'}`}>
                          {diff >= 0 ? '+' : '−'}
                          {yen(Math.abs(diff))}
                        </span>
                      </td>
                      <td>
                        {c.result.atRetirement ? yen(c.result.atRetirement.totalAssets) : '—'}
                      </td>
                      <td className={c.result.minRow.totalAssets < 0 ? 'is-negative' : undefined}>
                        {yen(c.result.minRow.totalAssets)}
                      </td>
                      <td className={c.result.depletion ? 'is-negative' : undefined}>
                        {c.result.depletion ? `${c.result.depletion.year}年` : 'なし'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">現金と投資の内訳</div>
        <p className="card-note">
          現金には預金金利{info.cashRate}%、投資には想定利回り{info.investmentRate}
          %を当てています。毎月{yenFine(info.monthlyInvestment)}
          を現金から投資へ積み立て、現金が不足する年は投資を取り崩します。
        </p>
        <div className="legend">
          {assetSeries.map((s) => (
            <span className="legend-item" key={s.id}>
              <span className="tt-line" style={{ background: s.color, width: 16, height: 2 }} />
              {s.label}
            </span>
          ))}
        </div>
        <TimeChart
          rows={result.rows}
          series={assetSeries}
          height={260}
          negativeFill="var(--critical)"
          hoverT={hoverT}
          onHoverT={setHoverT}
          ariaLabel="現金と投資資産の推移グラフ"
          imageName="現金と投資の内訳"
        />
      </section>

      <section className="card">
        <div className="card-title">年間の収入と支出</div>
        <p className="card-note">
          収入は手取り、支出には住居費と教育費を含みます。退職金や住宅の頭金、大型出費といったその年かぎりの出入りは、線が跳ねて読みにくくなるので外しています（総資産のグラフには入っています）。
        </p>
        <div className="legend">
          {cashflowSeries.map((s) => (
            <span className="legend-item" key={s.id}>
              <span className="tt-line" style={{ background: s.color, width: 16, height: 2 }} />
              {s.label}
            </span>
          ))}
        </div>
        <TimeChart
          rows={result.rows}
          series={cashflowSeries}
          height={260}
          hoverT={hoverT}
          onHoverT={setHoverT}
          ariaLabel="年間の収入と支出の推移グラフ"
          imageName="年間の収入と支出"
        />
      </section>

      <section className="card">
        <div className="card-title">ワンポイントアドバイス</div>
        <p className="card-note">影響の大きい順に表示しています。</p>
        <div className="advice-list">
          {advice.map((a, i) => (
            <div className={`advice level-${a.level}`} key={i}>
              <span className="advice-icon" aria-hidden="true">
                {ICON[a.level]}
              </span>
              <div>
                <div className="advice-title">{a.title}</div>
                <div className="advice-body">{a.body}</div>
              </div>
            </div>
          ))}
        </div>

        <details className="table-block">
          <summary>年次の内訳を表で見る</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>年</th>
                  <th>年齢</th>
                  <th>収入</th>
                  <th>ローン控除</th>
                  <th>生活費</th>
                  <th>住居費</th>
                  <th>教育費</th>
                  <th>大型出費</th>
                  <th>収支</th>
                  <th>積立</th>
                  <th>取崩</th>
                  <th>現金</th>
                  <th>投資</th>
                  <th>iDeCo</th>
                  <th>総資産</th>
                  <th style={{ textAlign: 'left' }}>イベント</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.t}>
                    <td>{r.year}</td>
                    <td>{r.age}</td>
                    <td>{Math.round(r.income).toLocaleString('ja-JP')}</td>
                    <td>{Math.round(r.loanTaxCredit).toLocaleString('ja-JP')}</td>
                    <td>{Math.round(r.living).toLocaleString('ja-JP')}</td>
                    <td>{Math.round(r.housing + r.lumpExpense).toLocaleString('ja-JP')}</td>
                    <td>{Math.round(r.education).toLocaleString('ja-JP')}</td>
                    <td>{Math.round(r.bigExpense).toLocaleString('ja-JP')}</td>
                    <td className={r.balance < 0 ? 'is-negative' : undefined}>
                      {Math.round(r.balance).toLocaleString('ja-JP')}
                    </td>
                    <td>{Math.round(r.contribution).toLocaleString('ja-JP')}</td>
                    <td className={r.withdrawal > 0 ? 'is-negative' : undefined}>
                      {Math.round(r.plannedWithdrawal + r.withdrawal).toLocaleString('ja-JP')}
                    </td>
                    <td className={r.cash < 0 ? 'is-negative' : undefined}>
                      {Math.round(r.cash).toLocaleString('ja-JP')}
                    </td>
                    <td>{Math.round(r.investments).toLocaleString('ja-JP')}</td>
                    <td>{Math.round(r.ideco).toLocaleString('ja-JP')}</td>
                    <td className={r.totalAssets < 0 ? 'is-negative' : undefined}>
                      {Math.round(r.totalAssets).toLocaleString('ja-JP')}
                    </td>
                    <td style={{ textAlign: 'left' }}>{r.events.join(' / ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="card">
        <div className="card-title">計算の前提</div>
        <div className="assumption">
          <ul>
            <li>手取りは、額面から給与所得控除・社会保険料（約14.7%）・所得税・住民税を引いた概算です。iDeCoの掛金は所得控除に反映しています。</li>
            <li>
              教育費は文部科学省の学習費調査などをもとにした年額です（公立小学校34万円、私立中学校156万円など）。授業料・通学費・制服・給食費・塾や習い事の費用を含み、入学の年には入学金を足します。公立と私立の差はここで表しているので、養育費は進路によって変えていません。
            </li>
            <li>
              持ち家は元利均等返済です。固定資産税と修繕費として物件価格の年1.0%、購入時の諸費用として価格の7%をみています。
            </li>
            <li>児童手当は0〜2歳が月1.5万円、3〜18歳が月1万円、第3子以降は月3万円です。</li>
            <li>
              生活費は大人の分に、お子さん1人あたりの養育費を人数分足しています（年齢帯ごとに設定でき、既定は年70〜100万円、0〜21歳で約1,870万円）。内閣府の子育て費用調査から教育関連を除いた金額で、学費は別勘定です。
            </li>
            <li>
              現金には預金金利、投資には想定利回りを別々に当て、積立額は現金から投資へ移します。積立は設定した年齢で止まり、取り崩しを始めると利回りも切り替わります。選んだ取り崩し方に加えて、現金が足りない年は不足分だけ追加で売ります。
            </li>
            <li>
              物価上昇率は生活費・教育費・家賃・大型出費・住宅の購入価格に反映します。ローンの返済額は借入時に決まるので据え置き、年金は物価の伸びに追いつかない前提（マクロ経済スライド）です。
            </li>
            <li>
              住宅ローン控除は、年末残高（上限あり）に控除率を掛けた額を、その年の所得税と住民税（課税所得の5%・上限9.75万円）の範囲で戻します。
            </li>
            <li>
              iDeCo・企業型DCの掛金は全額を所得控除として手取りに反映し、60歳まで別に運用してから投資資産へ合流させます。受け取るときの退職所得控除・公的年金等控除はみていません。
            </li>
            <li>
              退職後の生活費は現役期の85%、年金は65歳からの受け取りです。
            </li>
          </ul>
        </div>
      </section>

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          最初からやり直す
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSave}>
          この結果を保存
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← 条件を変えて試す
        </button>
        <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? '作成中…' : 'Excel をダウンロード'}
        </button>
      </div>
    </div>
  );
}
