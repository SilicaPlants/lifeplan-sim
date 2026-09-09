import type { BasicInfo, PlanAnswers } from './types';

/** 「条件を動かして試す」で動かす対象。基本情報だけでなく質問の答えも含む */
export interface Scenario {
  info: BasicInfo;
  answers: PlanAnswers;
}

export interface Knob {
  /** 保存に使う識別子。収入の変化などは元データの id を含む */
  id: string;
  label: string;
  unit: string;
  /** 選ぶ画面での見出し */
  group: string;
  min: number;
  max: number;
  step: number;
  /** 表示する小数桁 */
  digits: number;
  get: (s: Scenario) => number;
  set: (s: Scenario, v: number) => Scenario;
}

/** BasicInfo の数値項目をそのまま動かすつまみ */
type InfoKey = {
  [K in keyof BasicInfo]: BasicInfo[K] extends number ? K : never;
}[keyof BasicInfo];

function infoKnob(
  key: InfoKey,
  label: string,
  unit: string,
  min: number,
  max: number,
  step: number,
  digits: number,
  group = '基本情報',
): Knob {
  return {
    id: `info.${key}`,
    label,
    unit,
    group,
    min,
    max,
    step,
    digits,
    get: (s) => s.info[key],
    set: (s, v) => ({ ...s, info: { ...s.info, [key]: v } }),
  };
}

/** 配列のなかの 1 件だけを差し替える */
function replace<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

const PERSON: Record<string, string> = { self: '本人', spouse: '配偶者' };

/** いまの条件から、動かせるつまみの候補をすべて作る */
export function buildKnobs({ info, answers }: Scenario): Knob[] {
  const knobs: Knob[] = [
    infoKnob('investmentRate', '投資の想定利回り', '%', 0, 10, 0.1, 1, '運用'),
    infoKnob('monthlyInvestment', '毎月の積立額', '万円', 0, 30, 0.5, 1, '運用'),
    infoKnob('cashRate', '預金金利', '%', 0, 2, 0.05, 2, '運用'),
    infoKnob('cash', 'いまの現金・預金', '万円', 0, 5000, 10, 0, '運用'),
    infoKnob('investments', 'いまの投資資産', '万円', 0, 5000, 10, 0, '運用'),
    infoKnob('idecoMonthly', 'iDeCo・企業型DCの掛金（月）', '万円', 0, 6.8, 0.1, 1, '運用'),

    infoKnob('income', '本人の年収', '万円', 0, 2000, 10, 0, '収入'),
    ...(info.hasSpouse ? [infoKnob('spouseIncome', '配偶者の年収', '万円', 0, 2000, 10, 0, '収入')] : []),
    infoKnob('raiseRate', '昇給率', '%', 0, 5, 0.1, 1, '収入'),
    infoKnob('retireAge', '退職する年齢', '歳', 55, 75, 1, 0, '収入'),
    infoKnob('retirementPay', '退職金', '万円', 0, 5000, 50, 0, '収入'),
    infoKnob('pensionMonthly', '年金の月額（世帯）', '万円', 0, 50, 0.5, 1, '収入'),

    infoKnob('livingCost', '生活費（月）', '万円', 5, 60, 0.5, 1, '支出'),
    infoKnob('inflationRate', '物価上昇率', '%', 0, 5, 0.1, 1, '支出'),
    infoKnob(
      'rent',
      info.homeType === 'owned' ? 'ローン返済額（月）' : info.homeType === 'family' ? '家に入れる額（月）' : '家賃（月）',
      '万円',
      0,
      40,
      0.5,
      1,
      '支出',
    ),
    ...(info.homeType === 'owned'
      ? [
          infoKnob('homeUpkeepMonthly', '持ち家の維持費（月）', '万円', 0, 10, 0.1, 1, '支出'),
          infoKnob('loanPayoffAge', 'いまのローンの完済年齢', '歳', 40, 90, 1, 0, '住まい'),
        ]
      : []),
  ];

  // 収入の変化（転職・育休・復職など）
  answers.incomeEvents.forEach((e) => {
    const who = PERSON[e.person] ?? '';
    const name = e.label || '収入の変化';
    knobs.push({
      id: `income.${e.id}.amount`,
      label: `${name}後の${who}の年収`,
      unit: '万円',
      group: '収入の変化',
      min: 0,
      max: 2000,
      step: 10,
      digits: 0,
      get: (s) => s.answers.incomeEvents.find((x) => x.id === e.id)?.newIncome ?? 0,
      set: (s, v) => ({
        ...s,
        answers: { ...s.answers, incomeEvents: replace(s.answers.incomeEvents, e.id, { newIncome: v }) },
      }),
    });
    knobs.push({
      id: `income.${e.id}.when`,
      label: `${name}の時期（${who}）`,
      unit: '年後',
      group: '収入の変化',
      min: 0,
      max: 40,
      step: 1,
      digits: 0,
      get: (s) => s.answers.incomeEvents.find((x) => x.id === e.id)?.yearsLater ?? 0,
      set: (s, v) => ({
        ...s,
        answers: { ...s.answers, incomeEvents: replace(s.answers.incomeEvents, e.id, { yearsLater: v }) },
      }),
    });
  });

  // 毎月の積立額の変更
  answers.investmentChanges.forEach((c) => {
    const name = c.label || '積立額の変更';
    knobs.push({
      id: `invest.${c.id}.amount`,
      label: `${name}後の積立額（月）`,
      unit: '万円',
      group: '運用',
      min: 0,
      max: 30,
      step: 0.5,
      digits: 1,
      get: (s) => s.answers.investmentChanges.find((x) => x.id === c.id)?.monthlyAmount ?? 0,
      set: (s, v) => ({
        ...s,
        answers: {
          ...s.answers,
          investmentChanges: replace(s.answers.investmentChanges, c.id, { monthlyAmount: v }),
        },
      }),
    });
  });

  // 大型出費
  answers.bigExpenses.forEach((b) => {
    const name = b.label || '大型出費';
    knobs.push({
      id: `big.${b.id}.amount`,
      label: `${name}の金額`,
      unit: '万円',
      group: '大型出費',
      min: 0,
      max: 3000,
      step: 10,
      digits: 0,
      get: (s) => s.answers.bigExpenses.find((x) => x.id === b.id)?.amount ?? 0,
      set: (s, v) => ({
        ...s,
        answers: { ...s.answers, bigExpenses: replace(s.answers.bigExpenses, b.id, { amount: v }) },
      }),
    });
  });

  // 引越し
  answers.moves.forEach((m) => {
    const name = m.label || '引越し';
    knobs.push({
      id: `move.${m.id}.rent`,
      label: `${name}後の家賃（月）`,
      unit: '万円',
      group: '住まい',
      min: 0,
      max: 40,
      step: 0.5,
      digits: 1,
      get: (s) => s.answers.moves.find((x) => x.id === m.id)?.monthlyRent ?? 0,
      set: (s, v) => ({
        ...s,
        answers: { ...s.answers, moves: replace(s.answers.moves, m.id, { monthlyRent: v }) },
      }),
    });
  });

  // 住宅の購入
  if (answers.housing.planned) {
    const housingKnob = (
      field: 'price' | 'downPayment' | 'loanRate' | 'payoffAge' | 'yearsLater',
      label: string,
      unit: string,
      min: number,
      max: number,
      step: number,
      digits: number,
    ): Knob => ({
      id: `housing.${field}`,
      label,
      unit,
      group: '住まい',
      min,
      max,
      step,
      digits,
      get: (s) => s.answers.housing[field],
      set: (s, v) => ({ ...s, answers: { ...s.answers, housing: { ...s.answers.housing, [field]: v } } }),
    });
    knobs.push(
      housingKnob('price', '住宅の購入価格', '万円', 0, 20000, 100, 0),
      housingKnob('downPayment', '頭金', '万円', 0, 5000, 50, 0),
      housingKnob('loanRate', '借入金利', '%', 0, 5, 0.05, 2),
      housingKnob('payoffAge', 'ローンの完済年齢', '歳', 40, 90, 1, 0),
      housingKnob('yearsLater', '購入する時期', '年後', 0, 40, 1, 0),
    );
  }

  // 老後の取り崩し
  knobs.push(
    {
      id: 'retirement.withdrawalStartAge',
      label: '取り崩しを始める年齢',
      unit: '歳',
      group: '老後',
      min: 55,
      max: 90,
      step: 1,
      digits: 0,
      get: (s) => s.answers.retirement.withdrawalStartAge,
      set: (s, v) => ({
        ...s,
        answers: { ...s.answers, retirement: { ...s.answers.retirement, withdrawalStartAge: v } },
      }),
    },
    {
      id: 'retirement.postReturnRate',
      label: '取り崩し開始後の利回り',
      unit: '%',
      group: '老後',
      min: 0,
      max: 8,
      step: 0.1,
      digits: 1,
      get: (s) => s.answers.retirement.postReturnRate,
      set: (s, v) => ({
        ...s,
        answers: { ...s.answers, retirement: { ...s.answers.retirement, postReturnRate: v } },
      }),
    },
  );

  return knobs;
}

/** 最初から出しておくつまみ */
export const DEFAULT_KNOB_IDS = [
  'info.investmentRate',
  'info.monthlyInvestment',
  'info.income',
  'info.spouseIncome',
  'info.livingCost',
  'info.retireAge',
  'info.raiseRate',
  'info.inflationRate',
];

const STORE_KEY = 'lifeplansim.whatif.v1';

export function loadKnobIds(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_KNOB_IDS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_KNOB_IDS;
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return DEFAULT_KNOB_IDS;
  }
}

export function saveKnobIds(ids: string[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {
    // 保存できなくても操作は続けられる
  }
}
