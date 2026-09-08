import type { BasicInfo } from '../lib/types';
import { NumberField, NumberInput, ToggleField } from './Field';

interface Props {
  value: BasicInfo;
  onChange: (v: BasicInfo) => void;
  onNext: () => void;
}

export function BasicInfoForm({ value, onChange, onNext }: Props) {
  const set = <K extends keyof BasicInfo>(key: K, v: BasicInfo[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <div className="page-head">
        <h2>まずは今の家計を教えてください</h2>
        <p>
          わかる範囲の概算で構いません。あとから何度でも変更できます。金額はすべて「万円」単位です。
        </p>
      </div>

      <section className="card">
        <div className="card-title">家族構成</div>
        <p className="card-note">シミュレーションは95歳まで、1年きざみで計算します。</p>
        <div className="grid">
          <NumberField
            label="あなたの年齢"
            unit="歳"
            value={value.age}
            onChange={(v) => set('age', v)}
            min={18}
            max={90}
          />
          <ToggleField
            label="配偶者"
            value={value.hasSpouse}
            options={[
              { value: true, label: 'いる' },
              { value: false, label: 'いない' },
            ]}
            onChange={(v) => set('hasSpouse', v)}
          />
          {value.hasSpouse && (
            <NumberField
              label="配偶者の年齢"
              unit="歳"
              value={value.spouseAge}
              onChange={(v) => set('spouseAge', v)}
              min={18}
              max={90}
            />
          )}
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <span className="field-label">
            現在のお子さん
            <span className="field-hint">年齢を入力（0 = 今年生まれ）</span>
          </span>
          <div className="chip-row">
            {value.children.map((c, i) => (
              <span className="chip" key={i}>
                第{i + 1}子
                <NumberInput
                  min={0}
                  max={40}
                  value={c.age}
                  ariaLabel={`第${i + 1}子の年齢`}
                  onChange={(v) => {
                    const next = value.children.slice();
                    next[i] = { age: v };
                    set('children', next);
                  }}
                />
                歳
                <button
                  type="button"
                  aria-label={`第${i + 1}子を削除`}
                  onClick={() =>
                    set(
                      'children',
                      value.children.filter((_, j) => j !== i),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="link-btn"
              onClick={() => set('children', [...value.children, { age: 0 }])}
            >
              + 子どもを追加
            </button>
            {value.children.length === 0 && (
              <span className="field-desc">まだお子さんがいない場合はそのままで大丈夫です。</span>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">収入</div>
        <p className="card-note">税・社会保険料を引く前の額面（源泉徴収票の支払金額）を入れてください。</p>
        <div className="grid">
          <NumberField
            label="あなたの年収"
            unit="万円"
            value={value.income}
            onChange={(v) => set('income', v)}
            step={10}
          />
          {value.hasSpouse && (
            <NumberField
              label="配偶者の年収"
              unit="万円"
              value={value.spouseIncome}
              onChange={(v) => set('spouseIncome', v)}
              step={10}
              desc="働いていない場合は 0"
            />
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-title">支出</div>
        <p className="card-note">
          生活費は大人（本人・配偶者）の分だけを入れてください。住居費・教育費・お子さんの養育費は別々に計算します。
        </p>
        <div className="grid">
          <ToggleField
            label="現在の住まい"
            value={value.homeType}
            options={[
              { value: 'family' as const, label: '実家' },
              { value: 'rent' as const, label: '賃貸' },
              { value: 'owned' as const, label: '持ち家' },
            ]}
            onChange={(v) => set('homeType', v)}
          />
          <NumberField
            label={
              value.homeType === 'family'
                ? '家に入れている金額'
                : value.homeType === 'owned'
                  ? 'ローン返済額'
                  : '家賃・住居費'
            }
            unit="万円/月"
            value={value.rent}
            onChange={(v) => set('rent', v)}
            step={0.5}
            desc={
              value.homeType === 'family'
                ? '入れていなければ 0。将来の引越しは質問で設定します'
                : value.homeType === 'owned'
                  ? '維持費は下の欄で別に入力します'
                  : '管理費を含めた月額'
            }
          />
          {value.homeType === 'owned' && (
            <>
              <NumberField
                label="ローンの残り返済年数"
                unit="年"
                value={value.loanRemainingYears}
                onChange={(v) => set('loanRemainingYears', v)}
                min={0}
                max={50}
                desc={
                  value.loanRemainingYears > 0
                    ? `${value.age + value.loanRemainingYears}歳（${
                        new Date().getFullYear() + value.loanRemainingYears
                      }年）に完済。以降は維持費だけになります`
                    : '完済済み。維持費だけがかかります'
                }
              />
              <NumberField
                label="維持費"
                unit="万円/月"
                value={value.homeUpkeepMonthly}
                onChange={(v) => set('homeUpkeepMonthly', v)}
                step={0.5}
                max={50}
                desc="固定資産税・修繕積立金・管理費・保険。完済後も続きます"
              />
            </>
          )}
          <NumberField
            label="大人の生活費"
            unit="万円/月"
            value={value.livingCost}
            onChange={(v) => set('livingCost', v)}
            step={0.5}
            desc="本人と配偶者の分。食費・光熱費・通信費・保険・娯楽など"
          />
        </div>
      </section>

      <section className="card">
        <div className="card-title">資産（現金と投資を分けて計算します）</div>
        <p className="card-note">
          現金には預金金利、投資資産には想定利回りをそれぞれ適用します。毎年の余剰資金から積立額を投資に振り替え、現金が足りなくなった年は投資を取り崩して補う計算です。
        </p>
        <div className="grid">
          <NumberField
            label="現金・預金"
            unit="万円"
            value={value.cash}
            onChange={(v) => set('cash', v)}
            step={10}
            desc="普通預金・定期預金など、すぐ使えるお金"
          />
          <NumberField
            label="投資資産"
            unit="万円"
            value={value.investments}
            onChange={(v) => set('investments', v)}
            step={10}
            desc="投資信託・株式・iDeCo など"
          />
          <NumberField
            label="毎月の積立額"
            unit="万円/月"
            value={value.monthlyInvestment}
            onChange={(v) => set('monthlyInvestment', v)}
            step={0.5}
            max={100}
            desc="現金から投資へ回す額。余剰が足りない年は自動的に減額されます"
          />
          <NumberField
            label="預金金利"
            unit="%/年"
            value={value.cashRate}
            onChange={(v) => set('cashRate', v)}
            step={0.1}
            max={5}
            desc="普通預金なら 0.1 前後、定期預金なら 0.3 程度"
          />
          <NumberField
            label="投資の想定利回り"
            unit="%/年"
            value={value.investmentRate}
            onChange={(v) => set('investmentRate', v)}
            step={0.5}
            max={15}
            desc="全世界株のインデックス投資なら 3〜5 が目安"
          />
          <NumberField
            label="iDeCo・企業型DCの掛金"
            unit="万円/月"
            value={value.idecoMonthly}
            onChange={(v) => set('idecoMonthly', v)}
            step={0.1}
            max={10}
            desc="自分で出す掛金。全額が所得控除になり、60歳まで引き出せません（会社員の上限は月2.0〜2.3万円）"
          />
          <NumberField
            label="iDeCo・企業型DCの残高"
            unit="万円"
            value={value.idecoBalance}
            onChange={(v) => set('idecoBalance', v)}
            step={10}
            desc="いまの積立残高。60歳で投資資産に合流します"
          />
        </div>
      </section>

      <details className="card detail-toggle">
        <summary>詳細設定（昇給率・退職後の前提）</summary>
        <div className="grid">
          <NumberField
            label="昇給率"
            unit="%/年"
            value={value.raiseRate}
            onChange={(v) => set('raiseRate', v)}
            step={0.5}
            max={10}
          />
          <NumberField
            label="物価上昇率"
            unit="%/年"
            value={value.inflationRate}
            onChange={(v) => set('inflationRate', v)}
            step={0.5}
            max={10}
            desc="生活費・教育費・家賃・大型出費に反映します。0 なら物価上昇を見込みません（日本銀行の目標は2%）"
          />
          <NumberField
            label="退職年齢"
            unit="歳"
            value={value.retireAge}
            onChange={(v) => set('retireAge', v)}
            min={45}
            max={80}
          />
          <NumberField
            label="退職金"
            unit="万円"
            value={value.retirementPay}
            onChange={(v) => set('retirementPay', v)}
            step={100}
          />
          <NumberField
            label="年金の見込み額"
            unit="万円/月"
            value={value.pensionMonthly}
            onChange={(v) => set('pensionMonthly', v)}
            step={1}
            max={60}
            desc="世帯合計。会社員夫婦なら22万円前後が目安"
          />
        </div>
      </details>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          質問に進む →
        </button>
      </div>
    </div>
  );
}
