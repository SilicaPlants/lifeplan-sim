import type { BasicInfo, PlanAnswers } from './types';

/** 列番号（1 始まり）を Excel の列文字に変換する */
export function colLetter(n: number): string {
  let s = '';
  let v = n;
  while (v > 0) {
    const m = (v - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

export interface ChildPlan {
  label: string;
  /** 生年（西暦） */
  birthYear: number;
  /** 既存の子か、これから生まれる子か */
  existing: boolean;
  /** 第何子か（1 始まり。児童手当の第3子加算に使う） */
  order: number;
}

/** INPUT シートに書き出す子どもの一覧を組み立てる */
export function childPlans(info: BasicInfo, answers: PlanAnswers, startYear: number): ChildPlan[] {
  const list: ChildPlan[] = info.children.map((c, i) => ({
    label: `子ども${i + 1}`,
    birthYear: startYear - c.age,
    existing: true,
    order: i + 1,
  }));
  (answers.children.births ?? [])
    .slice()
    .sort((a, b) => a - b)
    .forEach((t, i) => {
      list.push({
        label: `子ども${info.children.length + i + 1}`,
        birthYear: startYear + t,
        existing: false,
        order: info.children.length + i + 1,
      });
    });
  return list;
}

/** 計算シートの列定義。key で数式から参照する */
export interface CalcColumn {
  key: string;
  header: string;
  width: number;
  /** 数値書式 */
  fmt?: string;
}

export function calcColumns(children: ChildPlan[]): CalcColumn[] {
  const money = '#,##0';
  const cols: CalcColumn[] = [
    { key: 'year', header: '年', width: 7 },
    { key: 'elapsed', header: '経過年数', width: 8 },
    { key: 'age', header: '本人年齢', width: 8 },
    { key: 'spouseAge', header: '配偶者年齢', width: 9 },
  ];
  children.forEach((c, i) => {
    cols.push({ key: `childAge${i}`, header: `${c.label}年齢`, width: 9 });
  });
  cols.push(
    { key: 'selfLastYear', header: '本人 直近の変更年', width: 12 },
    { key: 'selfLastIncome', header: '本人 変更後の年収', width: 13, fmt: money },
    { key: 'selfTaxFree', header: '本人 非課税区分', width: 12 },
    { key: 'spouseLastYear', header: '配偶者 直近の変更年', width: 13 },
    { key: 'spouseLastIncome', header: '配偶者 変更後の年収', width: 14, fmt: money },
    { key: 'spouseTaxFree', header: '配偶者 非課税区分', width: 13 },
    { key: 'selfGross', header: '本人 額面年収', width: 12, fmt: money },
    { key: 'selfDeduction', header: '本人 給与所得控除', width: 14, fmt: money },
    { key: 'selfInsurance', header: '本人 社会保険料', width: 13, fmt: money },
    { key: 'selfTaxable', header: '本人 課税所得', width: 12, fmt: money },
    { key: 'selfIncomeTax', header: '本人 所得税', width: 11, fmt: money },
    { key: 'selfResidentTax', header: '本人 住民税', width: 11, fmt: money },
    { key: 'selfNet', header: '本人 手取り', width: 12, fmt: money },
    { key: 'spouseGross', header: '配偶者 額面年収', width: 13, fmt: money },
    { key: 'spouseDeduction', header: '配偶者 給与所得控除', width: 15, fmt: money },
    { key: 'spouseInsurance', header: '配偶者 社会保険料', width: 14, fmt: money },
    { key: 'spouseTaxable', header: '配偶者 課税所得', width: 13, fmt: money },
    { key: 'spouseIncomeTax', header: '配偶者 所得税', width: 12, fmt: money },
    { key: 'spouseResidentTax', header: '配偶者 住民税', width: 12, fmt: money },
    { key: 'spouseNet', header: '配偶者 手取り', width: 13, fmt: money },
    { key: 'pensionGross', header: '年金 額面', width: 10, fmt: money },
    { key: 'pensionNet', header: '年金 手取り', width: 11, fmt: money },
    { key: 'allowance', header: '児童手当', width: 9, fmt: money },
    { key: 'lumpIncome', header: '退職金', width: 9, fmt: money },
    { key: 'loanBalance', header: '年末ローン残高', width: 13, fmt: money },
    { key: 'loanTaxCredit', header: '住宅ローン控除', width: 12, fmt: money },
    { key: 'income', header: '収入計', width: 11, fmt: money },
    { key: 'priceLevel', header: '物価水準', width: 9, fmt: '0.000' },
    { key: 'living', header: '生活費', width: 10, fmt: money },
    { key: 'education', header: '教育費', width: 10, fmt: money },
    { key: 'moveYear', header: '適用中の引越し年', width: 13 },
    { key: 'moveRent', header: '適用中の家賃(月)', width: 13, fmt: '#,##0.0' },
    { key: 'housing', header: '住居費', width: 10, fmt: money },
    { key: 'lumpExpense', header: '住宅・引越しの一時支出', width: 14, fmt: money },
    { key: 'bigExpense', header: '大型出費', width: 11, fmt: money },
    { key: 'investmentFunded', header: '投資から払う支出', width: 13, fmt: money },
    { key: 'expense', header: '支出計', width: 11, fmt: money },
    { key: 'balance', header: '年間収支', width: 10, fmt: money },
    { key: 'cashInterest', header: '預金利息', width: 9, fmt: '#,##0.0' },
    { key: 'investmentGain', header: '運用益', width: 10, fmt: money },
    { key: 'investChangeYear', header: '積立変更の適用年', width: 13 },
    { key: 'monthlyInvestment', header: '積立額(月)', width: 11, fmt: '#,##0.0' },
    { key: 'contribution', header: '積立額', width: 10, fmt: money },
    { key: 'idecoContribution', header: 'iDeCo掛金', width: 10, fmt: money },
    { key: 'ideco', header: 'iDeCo残高', width: 11, fmt: money },
    { key: 'expenseWithdrawal', header: '支出のための取崩額', width: 15, fmt: money },
    { key: 'plannedWithdrawal', header: '計画取崩額', width: 11, fmt: money },
    { key: 'withdrawal', header: '不足補填の取崩額', width: 13, fmt: money },
    { key: 'cash', header: '現金残高', width: 12, fmt: money },
    { key: 'investments', header: '投資残高', width: 12, fmt: money },
    { key: 'total', header: '総資産', width: 13, fmt: money },
    { key: 'shortYear', header: '資金ショート判定', width: 14 },
    { key: 'events', header: 'イベント（参考）', width: 22 },
  );
  return cols;
}
