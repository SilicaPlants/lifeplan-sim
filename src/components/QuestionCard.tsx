import { useState } from 'react';
import {
  defaultAnswers,
  defaultCareCosts,
  defaultEducationCosts,
  defaultEducationPath,
} from '../lib/defaults';
import { annualLoanPayment, educationCost, supportEndAgeFor } from '../lib/finance';
import { yen, yenFine } from '../lib/format';
import type { StepMeta } from '../lib/flow';
import type {
  BasicInfo,
  BigExpense,
  CareCostTable,
  FundingSource,
  InvestmentChange,
  MoveEvent,
  WithdrawalStrategy,
  EducationCostTable,
  EducationCosts,
  EducationPath,
  FinalStage,
  SchoolChoice,
  IncomeEvent,
  IncomeKind,
  IncomePerson,
  PlanAnswers,
} from '../lib/types';
import { NumberField, NumberInput, ToggleField } from './Field';

interface Props {
  step: StepMeta;
  index: number;
  total: number;
  info: BasicInfo;
  answers: PlanAnswers;
  onChange: (a: PlanAnswers) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}

interface ChoiceProps {
  title: string;
  desc?: string;
  on: boolean;
  onClick: () => void;
}

function Choice({ title, desc, on, onClick }: ChoiceProps) {
  return (
    <button type="button" className={`choice${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      <span className="choice-title">{title}</span>
      {desc && <span className="choice-desc" style={{ display: 'block' }}>{desc}</span>}
    </button>
  );
}

const CARE_FIELDS: { key: keyof CareCostTable; label: string; years: number }[] = [
  { key: 'infant', label: '0〜2歳', years: 3 },
  { key: 'preschool', label: '3〜5歳', years: 3 },
  { key: 'elementary', label: '6〜11歳', years: 6 },
  { key: 'juniorHigh', label: '12〜14歳', years: 3 },
  { key: 'highSchool', label: '15〜17歳', years: 3 },
  { key: 'university', label: '18〜21歳', years: 4 },
];

const STRATEGY_OPTIONS: { value: WithdrawalStrategy; title: string; desc: string }[] = [
  {
    value: 'asNeeded',
    title: '必要な分だけ取り崩す',
    desc: '生活費が足りない年に、不足分だけ売却します',
  },
  {
    value: 'fixedAmount',
    title: '毎年決まった額',
    desc: '生活費の補填として毎年同じ額を取り崩します',
  },
  {
    value: 'fixedRate',
    title: '毎年決まった率',
    desc: '残高の一定割合を取り崩します（4%ルールなど）',
  },
  {
    value: 'cashOut',
    title: '全額を現金化',
    desc: '取り崩し開始の年にすべて現金へ移します',
  },
];

const EDU_FIELDS: { key: keyof EducationCostTable; label: string }[] = [
  { key: 'kindergarten', label: '幼稚園（3〜5歳）' },
  { key: 'elementary', label: '小学校（6〜11歳）' },
  { key: 'juniorHigh', label: '中学校（12〜14歳）' },
  { key: 'highSchool', label: '高校（15〜17歳）' },
  { key: 'university', label: '大学（18〜21歳）' },
  { key: 'graduate', label: '大学院（22歳〜）' },
];

const PATH_STAGES: { key: keyof EducationPath; label: string; ages: string }[] = [
  { key: 'kindergarten', label: '幼稚園', ages: '3〜5歳' },
  { key: 'elementary', label: '小学校', ages: '6〜11歳' },
  { key: 'juniorHigh', label: '中学校', ages: '12〜14歳' },
  { key: 'highSchool', label: '高校', ages: '15〜17歳' },
  { key: 'university', label: '大学', ages: '18〜21歳' },
  { key: 'graduate', label: '大学院', ages: '22歳〜' },
];

const FINAL_OPTIONS: { value: FinalStage; label: string }[] = [
  { value: 'highSchool', label: '高校卒' },
  { value: 'university', label: '大学卒' },
  { value: 'graduate', label: '大学院卒' },
];

/** よくある進路の組み合わせ */
const PATH_PRESETS: { name: string; path: EducationPath; final: FinalStage }[] = [
  {
    name: 'すべて公立・大学卒',
    path: {
      kindergarten: 'public',
      elementary: 'public',
      juniorHigh: 'public',
      highSchool: 'public',
      university: 'public',
      graduate: 'public',
    },
    final: 'university',
  },
  {
    name: '大学だけ私立',
    path: {
      kindergarten: 'public',
      elementary: 'public',
      juniorHigh: 'public',
      highSchool: 'public',
      university: 'private',
      graduate: 'private',
    },
    final: 'university',
  },
  {
    name: '高校から私立',
    path: {
      kindergarten: 'public',
      elementary: 'public',
      juniorHigh: 'public',
      highSchool: 'private',
      university: 'private',
      graduate: 'private',
    },
    final: 'university',
  },
  {
    name: '中学から私立',
    path: {
      kindergarten: 'public',
      elementary: 'public',
      juniorHigh: 'private',
      highSchool: 'private',
      university: 'private',
      graduate: 'private',
    },
    final: 'university',
  },
  {
    name: 'すべて私立',
    path: {
      kindergarten: 'private',
      elementary: 'private',
      juniorHigh: 'private',
      highSchool: 'private',
      university: 'private',
      graduate: 'private',
    },
    final: 'university',
  },
  {
    name: '高校卒で就職',
    path: {
      kindergarten: 'public',
      elementary: 'public',
      juniorHigh: 'public',
      highSchool: 'public',
      university: 'public',
      graduate: 'public',
    },
    final: 'highSchool',
  },
];

/** その進路でかかる教育費の合計（入学金・大学院を含む） */
function educationTotal(
  path: EducationPath,
  finalStage: FinalStage,
  costs: EducationCosts,
  graduateYears: number,
): number {
  let total = 0;
  const endAge = supportEndAgeFor(finalStage, graduateYears);
  for (let age = 3; age <= endAge; age += 1) {
    total += educationCost(age, path, finalStage, costs, graduateYears);
  }
  return total;
}

const defaultCareTotal = CARE_FIELDS.reduce(
  (sum, f) => sum + defaultCareCosts[f.key] * f.years,
  0,
);

export function QuestionCard({
  step,
  index,
  total,
  info,
  answers,
  onChange,
  onBack,
  onNext,
  isLast,
}: Props) {
  const patch = <K extends 'children' | 'housing' | 'retirement'>(
    key: K,
    v: Partial<PlanAnswers[K]>,
  ) => onChange({ ...answers, [key]: { ...answers[key], ...v } });

  const futureBirths = (answers.children.births ?? []).slice().sort((a, b) => a - b);
  const hasAnyChild = info.children.length > 0 || futureBirths.length > 0;

  /** 人数を変えたら、誕生時期のリストを増減させる */
  const setChildCount = (count: number) => {
    const next = futureBirths.slice(0, count);
    while (next.length < count) {
      const prev = next.length > 0 ? next[next.length - 1] : 1;
      next.push(prev + 2);
    }
    patch('children', { births: next });
  };

  const setBirth = (index: number, value: number) => {
    const next = futureBirths.slice();
    next[index] = value;
    patch('children', { births: next });
  };

  // 古い保存データには養育費の設定がないことがある
  const careCosts = answers.children.careCosts ?? defaultCareCosts;
  const eduPath = answers.children.path ?? defaultEducationPath;
  const finalStage = answers.children.finalStage ?? 'university';
  const graduateYears = answers.children.graduateYears ?? 2;
  const supportEndAge = supportEndAgeFor(finalStage, graduateYears);
  /** その段階が最終学歴の範囲に入っているか */
  const stageActive = (key: keyof EducationPath) => {
    if (key === 'graduate') return finalStage === 'graduate';
    if (key === 'university') return finalStage !== 'highSchool';
    return true;
  };
  // 0〜21歳のあいだに 1 人あたりいくらかかるか
  const careTotal =
    CARE_FIELDS.reduce((sum, f) => sum + careCosts[f.key] * f.years, 0) +
    (finalStage === 'graduate' ? careCosts.university * graduateYears : 0) -
    (finalStage === 'highSchool' ? careCosts.university * 4 : 0);
  const changedCare = CARE_FIELDS.filter((f) => careCosts[f.key] !== defaultCareCosts[f.key]);

  const educationCosts = answers.children.educationCosts ?? defaultEducationCosts;
  // 物件価格・頭金は「いまの相場」で入力するため、購入年までの物価上昇を掛けて名目額にする
  const purchasePriceLevel = Math.pow(
    1 + (info.inflationRate ?? 0) / 100,
    answers.housing.yearsLater,
  );
  const loanPrincipalNominal =
    Math.max(0, answers.housing.price - answers.housing.downPayment) * purchasePriceLevel;
  // 完済年齢で指定するので、返済期間は購入時の年齢との差になる
  const housingLoanYears = Math.max(
    1,
    answers.housing.payoffAge - (info.age + answers.housing.yearsLater),
  );
  const retirement = answers.retirement ?? defaultAnswers.retirement;
  const eduTotal = educationTotal(eduPath, finalStage, educationCosts, graduateYears);
  const changedEdu = (['public', 'private'] as const).flatMap((kind) =>
    EDU_FIELDS.filter((f) => educationCosts[kind][f.key] !== defaultEducationCosts[kind][f.key]),
  );

  const [incomeOpenState, setIncomeOpenState] = useState(false);
  const incomeOpen = incomeOpenState || answers.incomeEvents.length > 0;
  const setIncomeOpen = setIncomeOpenState;

  // 入力中に行が動くと編集しづらいので、並べ替えはボタンを押したときだけ行う
  const sortEvents = () =>
    onChange({
      ...answers,
      incomeEvents: answers.incomeEvents
        .slice()
        .sort((a, b) => a.yearsLater - b.yearsLater || (a.person === 'self' ? -1 : 1)),
    });
  const eventsSorted = answers.incomeEvents.every(
    (e, i, arr) => i === 0 || arr[i - 1].yearsLater <= e.yearsLater,
  );

  /** 「◯年後」が西暦・家族それぞれの年齢で何を意味するかを表す */
  const whenLabel = (yearsLater: number): string => {
    const year = new Date().getFullYear() + yearsLater;
    const parts = [`本人${info.age + yearsLater}歳`];
    if (info.hasSpouse) parts.push(`配偶者${info.spouseAge + yearsLater}歳`);
    info.children.forEach((c, i) => parts.push(`第${i + 1}子${c.age + yearsLater}歳`));
    futureBirths.forEach((birth, i) => {
      if (yearsLater >= birth) {
        parts.push(`第${info.children.length + i + 1}子${yearsLater - birth}歳`);
      }
    });
    return `${year}年 · ${parts.join(' · ')}`;
  };

  const newId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `e${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  const addEvents = (list: Omit<IncomeEvent, 'id'>[]) =>
    onChange({
      ...answers,
      incomeEvents: [...answers.incomeEvents, ...list.map((e) => ({ ...e, id: newId() }))],
    });

  const patchEvent = (id: string, v: Partial<IncomeEvent>) =>
    onChange({
      ...answers,
      incomeEvents: answers.incomeEvents.map((e) => (e.id === id ? { ...e, ...v } : e)),
    });

  const removeEvent = (id: string) =>
    onChange({ ...answers, incomeEvents: answers.incomeEvents.filter((e) => e.id !== id) });

  // 育休は「第1子の誕生予定年」に合わせる
  const birthYear = futureBirths.length > 0 ? futureBirths[0] : 1;
  const spouseIncome = info.spouseIncome;
  const round10 = (v: number) => Math.round(v / 10) * 10;

  // 役職定年は 55 歳前後で管理職手当がなくなり、年収が 2〜3 割下がるのが一般的
  const POST_RETIREMENT_AGE = 55;
  const POST_RETIREMENT_RATIO = 0.75;
  const yearsUntil = (targetAge: number, currentAge: number) => Math.max(0, targetAge - currentAge);

  const presets: { name: string; build: () => Omit<IncomeEvent, 'id'>[] }[] = [];
  if (info.hasSpouse) {
    presets.push(
      {
        name: '配偶者の育休（2年）',
        build: () => [
          {
            person: 'spouse',
            yearsLater: birthYear,
            // 育児休業給付金は休業前賃金の 67%（181日目以降 50%）。非課税・社会保険料免除
            newIncome: round10(spouseIncome * 0.6),
            kind: 'benefit',
            label: '育休',
          },
          {
            person: 'spouse',
            yearsLater: birthYear + 2,
            newIncome: spouseIncome,
            kind: 'salary',
            label: '職場復帰',
          },
        ],
      },
      {
        name: '配偶者が専業主婦（主夫）に',
        build: () => [
          {
            person: 'spouse',
            yearsLater: birthYear,
            newIncome: 0,
            kind: 'salary',
            label: '退職（専業主婦・主夫）',
          },
        ],
      },
      {
        name: '配偶者の時短勤務',
        build: () => [
          {
            person: 'spouse',
            yearsLater: birthYear + 2,
            newIncome: round10(spouseIncome * 0.7),
            kind: 'salary',
            label: '時短勤務',
          },
        ],
      },
      {
        name: '配偶者の転職',
        build: () => [
          {
            person: 'spouse',
            yearsLater: 3,
            newIncome: round10(spouseIncome * 1.1),
            kind: 'salary',
            label: '転職',
          },
        ],
      },
      {
        name: `配偶者の役職定年（${POST_RETIREMENT_AGE}歳）`,
        build: () => [
          {
            person: 'spouse',
            yearsLater: yearsUntil(POST_RETIREMENT_AGE, info.spouseAge),
            newIncome: round10(spouseIncome * POST_RETIREMENT_RATIO),
            kind: 'salary',
            label: '役職定年',
          },
        ],
      },
    );
  }
  // ---- 大型出費 ----
  const [expenseOpenState, setExpenseOpenState] = useState(false);
  const expenseOpen = expenseOpenState || answers.bigExpenses.length > 0;

  // ---- 積立額の変更 ----
  const investmentChanges = answers.investmentChanges ?? [];

  const addInvestmentChange = () =>
    onChange({
      ...answers,
      investmentChanges: [
        ...investmentChanges,
        {
          id: newId(),
          yearsLater:
            investmentChanges.length > 0
              ? Math.max(...investmentChanges.map((c) => c.yearsLater)) + 5
              : 5,
          monthlyAmount: info.monthlyInvestment,
          label: '積立額の変更',
        },
      ],
    });

  const patchInvestmentChange = (id: string, v: Partial<InvestmentChange>) =>
    onChange({
      ...answers,
      investmentChanges: investmentChanges.map((c) => (c.id === id ? { ...c, ...v } : c)),
    });

  const removeInvestmentChange = (id: string) =>
    onChange({
      ...answers,
      investmentChanges: investmentChanges.filter((c) => c.id !== id),
    });

  // ---- 引越し ----
  const [moveOpenState, setMoveOpenState] = useState(false);
  const moveOpen = moveOpenState || answers.moves.length > 0;

  const addMoves = (list: Omit<MoveEvent, 'id'>[]) =>
    onChange({ ...answers, moves: [...answers.moves, ...list.map((m) => ({ ...m, id: newId() }))] });

  const patchMove = (id: string, v: Partial<MoveEvent>) =>
    onChange({
      ...answers,
      moves: answers.moves.map((m) => (m.id === id ? { ...m, ...v } : m)),
    });

  const removeMove = (id: string) =>
    onChange({ ...answers, moves: answers.moves.filter((m) => m.id !== id) });

  const sortMoves = () =>
    onChange({
      ...answers,
      moves: answers.moves.slice().sort((a, b) => a.yearsLater - b.yearsLater),
    });
  const movesSorted = answers.moves.every(
    (m, i, arr) => i === 0 || arr[i - 1].yearsLater <= m.yearsLater,
  );

  const sortExpenses = () =>
    onChange({
      ...answers,
      bigExpenses: answers.bigExpenses.slice().sort((a, b) => a.yearsLater - b.yearsLater),
    });
  const expensesSorted = answers.bigExpenses.every(
    (e, i, arr) => i === 0 || arr[i - 1].yearsLater <= e.yearsLater,
  );

  const addExpenses = (list: Omit<BigExpense, 'id'>[]) =>
    onChange({
      ...answers,
      bigExpenses: [...answers.bigExpenses, ...list.map((e) => ({ ...e, id: newId() }))],
    });

  const patchExpense = (id: string, v: Partial<BigExpense>) =>
    onChange({
      ...answers,
      bigExpenses: answers.bigExpenses.map((e) => (e.id === id ? { ...e, ...v } : e)),
    });

  const removeExpense = (id: string) =>
    onChange({ ...answers, bigExpenses: answers.bigExpenses.filter((e) => e.id !== id) });

  const simYears = Math.max(1, 95 - info.age);
  /** 95 歳までに何回発生し、合計いくらになるか */
  const expenseTotal = (e: BigExpense) => {
    if (e.amount <= 0 || e.yearsLater > simYears) return { count: 0, total: 0 };
    if (e.repeatYears <= 0) return { count: 1, total: e.amount };
    // 「◯歳まで」を指定していれば、その年齢までで打ち切る
    const limitYears =
      (e.untilAge ?? 0) > 0 ? Math.min(simYears, e.untilAge - info.age) : simYears;
    if (limitYears < e.yearsLater) return { count: 0, total: 0 };
    const count = Math.floor((limitYears - e.yearsLater) / e.repeatYears) + 1;
    return { count, total: count * e.amount };
  };
  const expenseGrandTotal = answers.bigExpenses.reduce((s2, e) => s2 + expenseTotal(e).total, 0);

  const REPEAT_OPTIONS = [0, 1, 2, 3, 5, 7, 10, 15];
  const repeatLabel = (v: number) => (v === 0 ? '1回だけ' : v === 1 ? '毎年' : `${v}年ごと`);

  const housingYear = answers.housing.planned ? answers.housing.yearsLater : 0;
  const expensePresets: { name: string; build: () => Omit<BigExpense, 'id'>[] }[] = [
    {
      name: '結婚式',
      build: () => [
        { yearsLater: 2, amount: 350, label: '結婚式', repeatYears: 0, untilAge: 0, fundedBy: 'cash' as const },
      ],
    },
    {
      name: '車の購入（7年ごと買い替え）',
      build: () => [
        {
          yearsLater: 2,
          amount: 250,
          label: '車の購入',
          repeatYears: 7,
          // 高齢になってからの買い替えは想定しないのが既定
          untilAge: 75,
          fundedBy: 'cash' as const,
        },
      ],
    },
    {
      name: '住宅リフォーム',
      build: () => [
        {
          yearsLater: housingYear > 0 ? housingYear + 15 : 15,
          amount: 300,
          label: '住宅リフォーム',
          repeatYears: 0,
          untilAge: 0,
          fundedBy: 'cash' as const,
        },
      ],
    },
    {
      name: '家族旅行（3年ごと）',
      build: () => [
        { yearsLater: 3, amount: 40, label: '家族旅行', repeatYears: 3, untilAge: 80, fundedBy: 'cash' as const },
      ],
    },
    {
      name: '家電の買い替え（8年ごと）',
      build: () => [
        { yearsLater: 4, amount: 40, label: '家電の買い替え', repeatYears: 8, untilAge: 0, fundedBy: 'cash' as const },
      ],
    },
  ];

  presets.push(
    {
      name: '本人の転職',
      build: () => [
        {
          person: 'self',
          yearsLater: 3,
          newIncome: round10(info.income * 1.15),
          kind: 'salary',
          label: '転職',
        },
      ],
    },
    {
      name: `本人の役職定年（${POST_RETIREMENT_AGE}歳）`,
      build: () => [
        {
          person: 'self',
          yearsLater: yearsUntil(POST_RETIREMENT_AGE, info.age),
          newIncome: round10(info.income * POST_RETIREMENT_RATIO),
          kind: 'salary',
          label: '役職定年',
        },
      ],
    },
    {
      name: '本人の育休（1年）',
      build: () => [
        {
          person: 'self',
          yearsLater: birthYear,
          newIncome: round10(info.income * 0.6),
          kind: 'benefit',
          label: '育休',
        },
        {
          person: 'self',
          yearsLater: birthYear + 1,
          newIncome: info.income,
          kind: 'salary',
          label: '職場復帰',
        },
      ],
    },
  );

  return (
    <div className="q-card">
      <div className="q-index">
        質問 {index + 1} / {total}
      </div>
      <h2 className="q-title">{step.question}</h2>

      {step.id === 'income' && (
        <>
          <p className="q-desc">
            転職、育休、時短勤務、専業主婦（主夫）、役職定年。収入が変わる予定を、何件でも登録できます。
          </p>
          <div className="q-choices">
            <Choice
              title="予定あり"
              desc="収入が変わるタイミングを登録します"
              on={incomeOpen}
              onClick={() => setIncomeOpen(true)}
            />
            <Choice
              title="予定なし"
              desc="今の働き方が続く前提で計算します"
              on={!incomeOpen}
              onClick={() => {
                setIncomeOpen(false);
                onChange({ ...answers, incomeEvents: [] });
              }}
            />
          </div>
          {incomeOpen && (
            <div className="q-detail">
              <div className="field-label" style={{ marginBottom: 8 }}>
                よくある変化から追加
              </div>
              <div className="chip-row" style={{ marginBottom: 18 }}>
                {presets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="link-btn"
                    onClick={() => addEvents(p.build())}
                  >
                    + {p.name}
                  </button>
                ))}
              </div>

              {answers.incomeEvents.length === 0 ? (
                <p className="field-desc">
                  まだ登録がありません。上のボタンから選ぶか、「収入の変化を追加」で自由に入れてください。
                </p>
              ) : (
                <div className="event-list">
                  <div className="event-row event-head">
                    <span>内容</span>
                    <span>対象</span>
                    <span>時期</span>
                    <span>変更後の年収</span>
                    <span>区分</span>
                    <span />
                  </div>
                  {answers.incomeEvents.map((e) => (
                    <div className="event-row" key={e.id}>
                      <input
                        type="text"
                        value={e.label}
                        aria-label="内容"
                        maxLength={12}
                        onChange={(ev) => patchEvent(e.id, { label: ev.target.value })}
                      />
                      <select
                        value={e.person}
                        aria-label="対象"
                        onChange={(ev) => patchEvent(e.id, { person: ev.target.value as IncomePerson })}
                      >
                        <option value="self">本人</option>
                        {info.hasSpouse && <option value="spouse">配偶者</option>}
                      </select>
                      <span className="event-when">
                        <NumberInput
                          value={e.yearsLater}
                          min={0}
                          max={60}
                          ariaLabel="何年後"
                          onChange={(v) => patchEvent(e.id, { yearsLater: v })}
                        />
                        <span className="event-unit">年後</span>
                      </span>
                      <span className="event-when">
                        <NumberInput
                          value={e.newIncome}
                          min={0}
                          step={10}
                          ariaLabel="変更後の年収"
                          onChange={(v) => patchEvent(e.id, { newIncome: v })}
                        />
                        <span className="event-unit">万円</span>
                      </span>
                      <select
                        value={e.kind}
                        aria-label="区分"
                        onChange={(ev) => patchEvent(e.id, { kind: ev.target.value as IncomeKind })}
                      >
                        <option value="salary">給与</option>
                        <option value="benefit">給付金（非課税）</option>
                      </select>
                      <button
                        type="button"
                        className="event-remove"
                        aria-label={`${e.label}を削除`}
                        onClick={() => removeEvent(e.id)}
                      >
                        ×
                      </button>
                      <span className="event-note">{whenLabel(e.yearsLater)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="chip-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    addEvents([
                      {
                        person: info.hasSpouse ? 'spouse' : 'self',
                        yearsLater: 3,
                        newIncome: info.hasSpouse ? info.spouseIncome : info.income,
                        kind: 'salary',
                        label: '収入の変化',
                      },
                    ])
                  }
                >
                  + 収入の変化を追加
                </button>
                {answers.incomeEvents.length > 1 && (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={eventsSorted}
                    onClick={sortEvents}
                  >
                    時期順に並べ替える
                  </button>
                )}
              </div>
              <p className="field-desc" style={{ marginTop: 12 }}>
                区分が「給付金」の行は、育児休業給付金のように非課税・社会保険料も免除として扱うため、入力額がそのまま手取りになります。年収 0
                は無収入（専業主婦・主夫など）です。役職定年の下げ幅は2〜3割が一般的ですが、時期も幅も会社によります。追加したあとに数字を合わせてください。定年後の再雇用も同じ形で登録できます。
              </p>
            </div>
          )}
        </>
      )}

      {step.id === 'children' && (
        <>
          <p className="q-desc">
            これから生まれる予定の人数です。すでにいるお子さんは基本情報から反映されています。
          </p>
          <div className="q-choices">
            {[0, 1, 2, 3, 4].map((c) => (
              <Choice
                key={c}
                title={c === 0 ? '予定なし' : `${c}人`}
                on={futureBirths.length === c}
                onClick={() => setChildCount(c)}
              />
            ))}
          </div>
          {hasAnyChild && (
            <div className="q-detail">
              {futureBirths.length > 0 && (
                <div className="grid">
                  {futureBirths.map((b, i) => (
                    <NumberField
                      key={i}
                      label={`第${info.children.length + i + 1}子が生まれるのは`}
                      unit="年後"
                      value={b}
                      onChange={(v) => setBirth(i, v)}
                      min={0}
                      max={30}
                      desc={whenLabel(b)}
                    />
                  ))}
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                <ToggleField
                  label="最終学歴（お子さん全員に適用）"
                  value={finalStage}
                  options={FINAL_OPTIONS}
                  onChange={(v) => patch('children', { finalStage: v })}
                  desc={`これ以降は教育費も養育費も計上しません（${supportEndAge}歳まで）`}
                />
              </div>
              {finalStage === 'graduate' && (
                <div className="grid" style={{ marginTop: 14 }}>
                  <NumberField
                    label="大学院の年数"
                    unit="年"
                    value={graduateYears}
                    onChange={(v) => patch('children', { graduateYears: v })}
                    min={1}
                    max={6}
                    desc={`修士なら2年、博士まで進むなら5年。22〜${supportEndAge}歳が対象です`}
                  />
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <span className="field-label">進路（段階ごとに選べます）</span>
                <div className="chip-row" style={{ margin: '8px 0 12px' }}>
                  {PATH_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        patch('children', { path: { ...p.path }, finalStage: p.final })
                      }
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="path-list">
                  {PATH_STAGES.map((st) => {
                    const active = stageActive(st.key);
                    const choice = eduPath[st.key];
                    const table = choice === 'private' ? educationCosts.private : educationCosts.public;
                    return (
                      <div className={`path-row${active ? '' : ' is-off'}`} key={st.key}>
                        <span className="path-name">
                          {st.label}
                          <em>{st.ages}</em>
                        </span>
                        <div className="toggle-group">
                          {(['public', 'private'] as SchoolChoice[]).map((v) => (
                            <button
                              key={v}
                              type="button"
                              className={`toggle${choice === v ? ' is-on' : ''}`}
                              aria-pressed={choice === v}
                              disabled={!active}
                              onClick={() =>
                                patch('children', { path: { ...eduPath, [st.key]: v } })
                              }
                            >
                              {v === 'public'
                                ? st.key === 'university' || st.key === 'graduate'
                                  ? '国公立'
                                  : '公立'
                                : '私立'}
                            </button>
                          ))}
                        </div>
                        <span className="path-cost">
                          {active ? `${yen(table[st.key])}/年` : '進学しない'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <details className="detail-toggle">
                <summary>
                  教育費を調整する（この方針だとお子さん1人あたり {yen(eduTotal)}）
                </summary>
                <p className="field-desc" style={{ marginTop: 12 }}>
                  文部科学省の学習費調査などをもとにした年額です。授業料のほか、通学費・制服・給食費・塾や習い事の費用まで含みます。
                  <strong>公立と私立の差はこの表で表現しているため</strong>
                  、下の養育費（食費・衣類・医療費など）は教育方針によらず同じ金額にしています。入学年には入学金（私立中20万円・私立高15万円・大学は公立15万円/私立30万円、大学院20万円）を自動で加算します。
                </p>
                {(['public', 'private'] as const).map((kind) => (
                  <div key={kind} style={{ marginTop: 14 }}>
                    <div className="field-label" style={{ marginBottom: 8 }}>
                      {kind === 'public' ? '公立（年額）' : '私立（年額）'}
                    </div>
                    <div className="grid">
                      {EDU_FIELDS.map((f) => {
                        const applied =
                          stageActive(f.key) && eduPath[f.key] === kind;
                        const changed =
                          educationCosts[kind][f.key] !== defaultEducationCosts[kind][f.key];
                        return (
                          <NumberField
                            key={f.key}
                            label={f.label}
                            hint={
                              applied ? (changed ? '適用中・変更あり' : '適用中') : changed ? '変更あり' : undefined
                            }
                            unit="万円/年"
                            value={educationCosts[kind][f.key]}
                            onChange={(v) =>
                              patch('children', {
                                educationCosts: {
                                  ...educationCosts,
                                  [kind]: { ...educationCosts[kind], [f.key]: v },
                                },
                              })
                            }
                            step={5}
                            max={2000}
                            desc={changed ? `既定値 ${defaultEducationCosts[kind][f.key]}万円` : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="chip-row" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="link-btn"
                    disabled={changedEdu.length === 0}
                    onClick={() => patch('children', { educationCosts: defaultEducationCosts })}
                  >
                    既定値に戻す
                  </button>
                  <span className="field-desc">
                    {changedEdu.length === 0
                      ? '現在はすべて既定値です'
                      : `${changedEdu.length}項目を変更中`}
                  </span>
                </div>
              </details>

              <details className="detail-toggle">
                <summary>
                  養育費を調整する（お子さん1人あたり 0〜{supportEndAge}歳で {yen(careTotal)}）
                </summary>
                <p className="field-desc" style={{ marginTop: 12 }}>
                  学費以外にかかるお金です。食費・衣類・医療費・生活用品・小遣い・レジャー費に加え、家族が増えることで上がる光熱費や通信費も含みます。通学費・制服・給食費・塾代は上の教育費に入っているので、ここには含めません。この金額が人数分そのまま生活費に乗ります。大学院に進む設定なら、在学中も「18〜21歳」の額が続きます。既定値は内閣府の子育て費用調査から保育料・学校教育費などの教育関連を差し引き、近年の物価上昇を加味した目安（1人あたり0〜21歳で約1,870万円）です。18歳以降に一人暮らしで仕送りをする場合は、18〜21歳を120〜150万円に上げてください。
                </p>
                <div className="grid">
                  {CARE_FIELDS.map((f) => {
                    const changed = careCosts[f.key] !== defaultCareCosts[f.key];
                    return (
                      <NumberField
                        key={f.key}
                        label={f.label}
                        hint={changed ? '変更中' : undefined}
                        unit="万円/年"
                        value={careCosts[f.key]}
                        onChange={(v) =>
                          patch('children', { careCosts: { ...careCosts, [f.key]: v } })
                        }
                        step={5}
                        max={1000}
                        desc={changed ? `既定値 ${defaultCareCosts[f.key]}万円` : undefined}
                      />
                    );
                  })}
                </div>
                <div className="chip-row" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="link-btn"
                    disabled={changedCare.length === 0}
                    onClick={() => patch('children', { careCosts: defaultCareCosts })}
                  >
                    既定値に戻す
                  </button>
                  <span className="field-desc">
                    {changedCare.length === 0
                      ? '現在はすべて既定値です'
                      : `${changedCare.length}項目を変更中（既定値の合計は ${yen(defaultCareTotal)}）`}
                  </span>
                </div>
              </details>
            </div>
          )}
        </>
      )}

      {step.id === 'housing' && (
        <>
          <p className="q-desc">
            購入すると、その年から家賃はなくなり、ローン返済と維持費（固定資産税・修繕費）に置き換わります。
          </p>
          <div className="q-choices">
            <Choice
              title="購入する予定"
              desc="時期・価格・頭金を入力します"
              on={answers.housing.planned}
              onClick={() => patch('housing', { planned: true })}
            />
            <Choice
              title="賃貸を続ける"
              desc="このあと引越しの予定をうかがいます"
              on={!answers.housing.planned}
              onClick={() => patch('housing', { planned: false })}
            />
          </div>
          {answers.housing.planned && (
            <div className="q-detail">
              <div className="grid">
                <NumberField
                  label="購入時期"
                  unit="年後"
                  value={answers.housing.yearsLater}
                  onChange={(v) => patch('housing', { yearsLater: v })}
                  min={0}
                  max={40}
                  desc={whenLabel(answers.housing.yearsLater)}
                />
                <NumberField
                  label="物件価格"
                  unit="万円"
                  value={answers.housing.price}
                  onChange={(v) => patch('housing', { price: v })}
                  step={100}
                  desc={
                    purchasePriceLevel > 1
                      ? `いまの相場で入力してください。購入時は約${yen(
                          answers.housing.price * purchasePriceLevel,
                        )}になる計算です（物価上昇${info.inflationRate}%）`
                      : 'いまの相場で入力してください'
                  }
                />
                <NumberField
                  label="頭金"
                  unit="万円"
                  value={answers.housing.downPayment}
                  onChange={(v) => patch('housing', { downPayment: v })}
                  step={50}
                  desc={`諸費用として別途 ${yen(
                    answers.housing.price * 0.07 * purchasePriceLevel,
                  )} を計上します`}
                />
                <NumberField
                  label="ローンの完済年齢"
                  unit="歳"
                  value={answers.housing.payoffAge}
                  onChange={(v) => patch('housing', { payoffAge: v })}
                  min={info.age + answers.housing.yearsLater + 1}
                  max={100}
                  desc={
                    answers.housing.payoffAge > info.age + answers.housing.yearsLater
                      ? `${housingLoanYears}年返済（完済は ${whenLabel(
                          answers.housing.yearsLater + housingLoanYears,
                        )}）`
                      : '購入する年より後の年齢を入れてください'
                  }
                />
                <NumberField
                  label="借入金利"
                  unit="%"
                  value={answers.housing.loanRate}
                  onChange={(v) => patch('housing', { loanRate: v })}
                  step={0.1}
                  max={10}
                />
                <ToggleField
                  label="頭金・諸費用の支払い元"
                  value={answers.housing.fundedBy}
                  options={[
                    { value: 'cash' as const, label: '現金から' },
                    { value: 'investment' as const, label: '投資を取り崩す' },
                  ]}
                  onChange={(v) => patch('housing', { fundedBy: v })}
                  desc="投資を選ぶと、購入年にその分だけ投資資産を売却します"
                />
                <ToggleField
                  label="住宅ローン控除"
                  value={answers.housing.taxCredit}
                  options={[
                    { value: true, label: '使う' },
                    { value: false, label: '使わない' },
                  ]}
                  onChange={(v) => patch('housing', { taxCredit: v })}
                  desc="年末残高に控除率を掛けた額が、所得税・住民税から戻ります"
                />
              </div>
              {answers.housing.taxCredit && (
                <div className="grid" style={{ marginTop: 14 }}>
                  <NumberField
                    label="控除期間"
                    unit="年"
                    value={answers.housing.creditYears}
                    onChange={(v) => patch('housing', { creditYears: v })}
                    min={0}
                    max={20}
                    desc="新築は13年、中古は10年が目安"
                  />
                  <NumberField
                    label="控除率"
                    unit="%"
                    value={answers.housing.creditRate}
                    onChange={(v) => patch('housing', { creditRate: v })}
                    step={0.1}
                    max={5}
                  />
                  <NumberField
                    label="控除対象の残高上限"
                    unit="万円"
                    value={answers.housing.creditLimit}
                    onChange={(v) => patch('housing', { creditLimit: v })}
                    step={500}
                    desc="住宅の省エネ性能により2,000〜5,000万円。長期優良住宅なら4,500万円"
                  />
                </div>
              )}
              <p className="field-desc" style={{ marginTop: 14 }}>
                借入額 <strong>{yen(loanPrincipalNominal)}</strong> → 毎月の返済は約{' '}
                <strong>
                  {yen(
                    annualLoanPayment(
                      loanPrincipalNominal,
                      housingLoanYears,
                      answers.housing.loanRate,
                    ) / 12,
                  )}
                </strong>
                （いまの住居費：{yenFine(info.rent)}/月）
              </p>
            </div>
          )}
        </>
      )}

      {step.id === 'moving' && (
        <>
          <p className="q-desc">
            家族が増えて手狭になったときの住み替えなど、家賃が変わる予定を何回でも登録できます。
            {answers.housing.planned
              ? '住宅を買うまでの住まいとして計算します（購入後は持ち家に切り替わります）。'
              : ''}
          </p>
          <div className="q-choices">
            <Choice
              title="引越す予定"
              desc="時期と新しい家賃を登録します"
              on={moveOpen}
              onClick={() => setMoveOpenState(true)}
            />
            <Choice
              title="予定なし"
              desc={`いまの住居費 ${yenFine(info.rent)}/月 のまま`}
              on={!moveOpen}
              onClick={() => {
                setMoveOpenState(false);
                onChange({ ...answers, moves: [] });
              }}
            />
          </div>
          {moveOpen && (
            <div className="q-detail">
              {answers.moves.length === 0 ? (
                <p className="field-desc">
                  まだ登録がありません。「引越しを追加」から入れてください。
                </p>
              ) : (
                <div className="event-list">
                  <div className="event-row move-row event-head">
                    <span>内容</span>
                    <span>時期</span>
                    <span>引越し後の家賃</span>
                    <span>初期費用</span>
                    <span />
                  </div>
                  {answers.moves.map((m) => (
                    <div className="event-row move-row" key={m.id}>
                      <input
                        type="text"
                        value={m.label}
                        aria-label="内容"
                        maxLength={14}
                        onChange={(ev) => patchMove(m.id, { label: ev.target.value })}
                      />
                      <span className="event-when">
                        <NumberInput
                          value={m.yearsLater}
                          min={0}
                          max={70}
                          ariaLabel="何年後"
                          onChange={(v) => patchMove(m.id, { yearsLater: v })}
                        />
                        <span className="event-unit">年後</span>
                      </span>
                      <span className="event-when">
                        <NumberInput
                          value={m.monthlyRent}
                          min={0}
                          step={0.5}
                          ariaLabel="引越し後の家賃"
                          onChange={(v) => patchMove(m.id, { monthlyRent: v })}
                        />
                        <span className="event-unit">万円/月</span>
                      </span>
                      <span className="event-when">
                        <NumberInput
                          value={m.initialCostMonths}
                          min={0}
                          max={12}
                          ariaLabel="初期費用の月数"
                          onChange={(v) => patchMove(m.id, { initialCostMonths: v })}
                        />
                        <span className="event-unit">
                          か月分
                          <em>{yen(m.monthlyRent * m.initialCostMonths)}</em>
                        </span>
                      </span>
                      <button
                        type="button"
                        className="event-remove"
                        aria-label={`${m.label}を削除`}
                        onClick={() => removeMove(m.id)}
                      >
                        ×
                      </button>
                      <span className="event-note">{whenLabel(m.yearsLater)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="chip-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    addMoves([
                      {
                        yearsLater: answers.moves.length > 0
                          ? Math.max(...answers.moves.map((m) => m.yearsLater)) + 3
                          : 3,
                        monthlyRent: Math.max(info.rent, 1) + 3,
                        initialCostMonths: 4,
                        label: '引越し',
                      },
                    ])
                  }
                >
                  + 引越しを追加
                </button>
                {answers.moves.length > 1 && (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={movesSorted}
                    onClick={sortMoves}
                  >
                    時期順に並べ替える
                  </button>
                )}
              </div>
              <p className="field-desc" style={{ marginTop: 12 }}>
                初期費用は敷金・礼金・引越し代の目安です。新しい家賃の指定した月数分を、その年の支出に入れます。
              </p>
            </div>
          )}
        </>
      )}

      {step.id === 'bigExpense' && (
        <>
          <p className="q-desc">
            結婚式、車の購入、リフォーム、旅行。まとまった支出を登録できます。車の買い替えのように繰り返すものも扱えます。
          </p>
          <div className="q-choices">
            <Choice
              title="予定あり"
              desc="時期・金額・繰り返しを登録します"
              on={expenseOpen}
              onClick={() => setExpenseOpenState(true)}
            />
            <Choice
              title="予定なし"
              desc="大きな出費は見込まずに計算します"
              on={!expenseOpen}
              onClick={() => {
                setExpenseOpenState(false);
                onChange({ ...answers, bigExpenses: [] });
              }}
            />
          </div>
          {expenseOpen && (
            <div className="q-detail">
              <div className="field-label" style={{ marginBottom: 8 }}>
                よくある出費から追加
              </div>
              <div className="chip-row" style={{ marginBottom: 18 }}>
                {expensePresets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="link-btn"
                    onClick={() => addExpenses(p.build())}
                  >
                    + {p.name}
                  </button>
                ))}
              </div>

              {answers.bigExpenses.length === 0 ? (
                <p className="field-desc">
                  まだ登録がありません。上のボタンから選ぶか、「大型出費を追加」で自由に入れてください。
                </p>
              ) : (
                <div className="event-list">
                  <div className="event-row expense-row event-head">
                    <span>内容</span>
                    <span>時期</span>
                    <span>金額</span>
                    <span>繰り返し</span>
                    <span>95歳までの合計</span>
                    <span />
                  </div>
                  {answers.bigExpenses.map((e) => {
                    const { count, total } = expenseTotal(e);
                    return (
                      <div className="event-row expense-row" key={e.id}>
                        <input
                          type="text"
                          value={e.label}
                          aria-label="内容"
                          maxLength={14}
                          onChange={(ev) => patchExpense(e.id, { label: ev.target.value })}
                        />
                        <span className="event-when">
                          <NumberInput
                            value={e.yearsLater}
                            min={0}
                            max={70}
                            ariaLabel="何年後"
                            onChange={(v) => patchExpense(e.id, { yearsLater: v })}
                          />
                          <span className="event-unit">年後</span>
                        </span>
                        <span className="event-when">
                          <NumberInput
                            value={e.amount}
                            min={0}
                            step={10}
                            ariaLabel="金額"
                            onChange={(v) => patchExpense(e.id, { amount: v })}
                          />
                          <span className="event-unit">万円</span>
                        </span>
                        <select
                          value={e.repeatYears}
                          aria-label="繰り返し"
                          onChange={(ev) =>
                            patchExpense(e.id, { repeatYears: Number(ev.target.value) })
                          }
                        >
                          {(REPEAT_OPTIONS.includes(e.repeatYears)
                            ? REPEAT_OPTIONS
                            : [...REPEAT_OPTIONS, e.repeatYears].sort((a, b) => a - b)
                          ).map((v) => (
                            <option key={v} value={v}>
                              {repeatLabel(v)}
                            </option>
                          ))}
                        </select>
                        <span className="event-total">
                          {yen(total)}
                          {count > 1 && <em>{count}回</em>}
                        </span>
                        <button
                          type="button"
                          className="event-remove"
                          aria-label={`${e.label}を削除`}
                          onClick={() => removeExpense(e.id)}
                        >
                          ×
                        </button>
                        <span className="expense-sub">
                          {e.repeatYears > 0 && (
                            <span className="event-when">
                              <NumberInput
                                value={e.untilAge}
                                min={0}
                                max={95}
                                ariaLabel="何歳まで繰り返すか"
                                onChange={(v) => patchExpense(e.id, { untilAge: v })}
                              />
                              <span className="event-unit">
                                {e.untilAge > 0 ? '歳まで' : '歳まで（0＝期限なし）'}
                              </span>
                            </span>
                          )}
                          <select
                            value={e.fundedBy}
                            aria-label="支払い元"
                            onChange={(ev) =>
                              patchExpense(e.id, {
                                fundedBy: ev.target.value as FundingSource,
                              })
                            }
                          >
                            <option value="cash">現金から払う</option>
                            <option value="investment">投資を取り崩す</option>
                          </select>
                          <span className="event-note">{whenLabel(e.yearsLater)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="chip-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    addExpenses([
                      {
                        yearsLater: 3,
                        amount: 100,
                        label: 'まとまった出費',
                        repeatYears: 0,
                        untilAge: 0,
                        fundedBy: 'cash',
                      },
                    ])
                  }
                >
                  + 大型出費を追加
                </button>
                {answers.bigExpenses.length > 1 && (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={expensesSorted}
                    onClick={sortExpenses}
                  >
                    時期順に並べ替える
                  </button>
                )}
                {answers.bigExpenses.length > 0 && (
                  <span className="field-desc">
                    95歳までの合計：<strong>{yen(expenseGrandTotal)}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {step.id === 'retirement' && (
        <>
          <p className="q-desc">
            積み立てる額は途中で変えられます。退職後の取り崩し方によって、資産の減り方も相場下落の影響も変わります。退職年齢は基本情報で{info.retireAge}歳に設定しています。
          </p>
          <div className="q-choices">
            {STRATEGY_OPTIONS.map((o) => (
              <Choice
                key={o.value}
                title={o.title}
                desc={o.desc}
                on={retirement.strategy === o.value}
                onClick={() => patch('retirement', { strategy: o.value })}
              />
            ))}
          </div>

          <div className="q-detail">
            <div className="field-label" style={{ marginBottom: 8 }}>
              積立額の変更（毎月 {yenFine(info.monthlyInvestment)} から始めます）
            </div>
            {investmentChanges.length === 0 ? (
              <p className="field-desc">
                いまはずっと同じ額で積み立てる設定です。子育て期に減らす、昇給後に増やす、といった変化を入れられます。
              </p>
            ) : (
              <div className="event-list">
                <div className="event-row invest-row event-head">
                  <span>内容</span>
                  <span>時期</span>
                  <span>変更後の積立額</span>
                  <span />
                </div>
                {investmentChanges.map((c) => (
                  <div className="event-row invest-row" key={c.id}>
                    <input
                      type="text"
                      value={c.label}
                      aria-label="内容"
                      maxLength={14}
                      onChange={(ev) => patchInvestmentChange(c.id, { label: ev.target.value })}
                    />
                    <span className="event-when">
                      <NumberInput
                        value={c.yearsLater}
                        min={0}
                        max={70}
                        ariaLabel="何年後"
                        onChange={(v) => patchInvestmentChange(c.id, { yearsLater: v })}
                      />
                      <span className="event-unit">年後</span>
                    </span>
                    <span className="event-when">
                      <NumberInput
                        value={c.monthlyAmount}
                        min={0}
                        step={0.5}
                        ariaLabel="変更後の積立額"
                        onChange={(v) => patchInvestmentChange(c.id, { monthlyAmount: v })}
                      />
                      <span className="event-unit">万円/月</span>
                    </span>
                    <button
                      type="button"
                      className="event-remove"
                      aria-label={`${c.label}を削除`}
                      onClick={() => removeInvestmentChange(c.id)}
                    >
                      ×
                    </button>
                    <span className="event-note">{whenLabel(c.yearsLater)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="chip-row" style={{ margin: '14px 0 20px' }}>
              <button type="button" className="link-btn" onClick={addInvestmentChange}>
                + 積立額の変更を追加
              </button>
            </div>

            <div className="grid">
              <NumberField
                label="積立をやめる年齢"
                unit="歳"
                value={retirement.contributionEndAge}
                onChange={(v) => patch('retirement', { contributionEndAge: v })}
                min={30}
                max={95}
                desc="この年齢になったら積立を止めます"
              />
              <NumberField
                label="取り崩しを始める年齢"
                unit="歳"
                value={retirement.withdrawalStartAge}
                onChange={(v) => patch('retirement', { withdrawalStartAge: v })}
                min={30}
                max={95}
                desc="この年齢から下の利回りに切り替わります"
              />
              {retirement.strategy === 'fixedAmount' && (
                <NumberField
                  label="毎年の取り崩し額"
                  unit="万円/年"
                  value={retirement.fixedAmount}
                  onChange={(v) => patch('retirement', { fixedAmount: v })}
                  step={10}
                  desc={`月あたり ${yen(retirement.fixedAmount / 12)}`}
                />
              )}
              {retirement.strategy === 'fixedRate' && (
                <NumberField
                  label="毎年の取り崩し率"
                  unit="%/年"
                  value={retirement.fixedRate}
                  onChange={(v) => patch('retirement', { fixedRate: v })}
                  step={0.5}
                  max={20}
                  desc="残高に対する割合。4%が目安としてよく使われます"
                />
              )}
              {retirement.strategy !== 'cashOut' && (
                <NumberField
                  label="取り崩し開始後の利回り"
                  unit="%/年"
                  value={retirement.postReturnRate}
                  onChange={(v) => patch('retirement', { postReturnRate: v })}
                  step={0.5}
                  max={15}
                  desc={`現役期は${info.investmentRate}%。債券などへ移してリスクを下げるなら低めに設定します`}
                />
              )}
            </div>
            <p className="field-desc" style={{ marginTop: 14 }}>
              どの方法でも、現金が足りない年は不足分だけ追加で取り崩します。取り崩したお金は現金に入るので、使い切らなければそのまま残ります。
            </p>
          </div>
        </>
      )}

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← 戻る
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {isLast ? '結果を見る →' : '次へ →'}
        </button>
      </div>
    </div>
  );
}
