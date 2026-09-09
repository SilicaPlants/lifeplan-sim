import { defaultAnswers, defaultBasicInfo, legacyCareCosts } from './defaults';
import { saveFile, type SaveResult } from './download';
import type { EducationCostTable, EducationPath, SchoolChoice } from './types';
import type { BasicInfo, PlanAnswers } from './types';

const PLANS_KEY = 'lifeplansim.plans.v1';
export const EXPORT_FORMAT = 'lifeplansim.plans';
const EXPORT_VERSION = 1;

export interface SavedPlan {
  id: string;
  name: string;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
  info: BasicInfo;
  answers: PlanAnswers;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ *
 * 取り込むデータは外部ファイル由来のこともあるため、
 * 既定値をベースに 1 項目ずつ型を確かめて詰め直す。
 * ------------------------------------------------------------------ */

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

const str = (v: unknown, fallback: string, maxLength = 200): string =>
  typeof v === 'string' ? v.slice(0, maxLength) : fallback;

export function parseInfo(raw: unknown): BasicInfo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const d = defaultBasicInfo;
  return {
    age: num(o.age, d.age),
    hasSpouse: bool(o.hasSpouse, d.hasSpouse),
    spouseAge: num(o.spouseAge, d.spouseAge),
    income: num(o.income, d.income),
    spouseIncome: num(o.spouseIncome, d.spouseIncome),
    children: Array.isArray(o.children)
      ? o.children
          .slice(0, 10)
          .map((c) => ({ age: num((c as Record<string, unknown>)?.age, 0) }))
      : d.children,
    homeType:
      o.homeType === 'family' || o.homeType === 'owned' || o.homeType === 'rent'
        ? o.homeType
        : d.homeType,
    rent: num(o.rent, d.rent),
    // 旧形式は「残り返済年数」だったので、いまの年齢を足して完済年齢にする
    loanPayoffAge:
      o.loanPayoffAge === undefined && o.loanRemainingYears !== undefined
        ? num(o.age, d.age) + num(o.loanRemainingYears, 0)
        : num(o.loanPayoffAge, d.loanPayoffAge),
    homeUpkeepMonthly: num(o.homeUpkeepMonthly, d.homeUpkeepMonthly),
    livingCost: num(o.livingCost, d.livingCost),
    cash: num(o.cash, d.cash),
    investments: num(o.investments, d.investments),
    cashRate: num(o.cashRate, d.cashRate),
    investmentRate: num(o.investmentRate, d.investmentRate),
    monthlyInvestment: num(o.monthlyInvestment, d.monthlyInvestment),
    idecoMonthly: num(o.idecoMonthly, d.idecoMonthly),
    idecoBalance: num(o.idecoBalance, d.idecoBalance),
    raiseRate: num(o.raiseRate, d.raiseRate),
    inflationRate: num(o.inflationRate, d.inflationRate),
    retireAge: num(o.retireAge, d.retireAge),
    retirementPay: num(o.retirementPay, d.retirementPay),
    pensionMonthly: num(o.pensionMonthly, d.pensionMonthly),
  };
}

/** info は旧形式（返済期間）を完済年齢に読み替えるときだけ使う */
export function parseAnswers(raw: unknown, info?: BasicInfo): PlanAnswers {
  const o = (raw ?? {}) as Record<string, unknown>;
  const d = defaultAnswers;
  const children = (o.children ?? {}) as Record<string, unknown>;
  const housing = (o.housing ?? {}) as Record<string, unknown>;
  const moving = (o.moving ?? {}) as Record<string, unknown>;
  // 旧形式（education: public / mixed / private）は段階ごとの選択へ読み替える
  const legacyPlan = str(children.education, '');
  const legacyPath = (): EducationPath => {
    const priv: SchoolChoice = 'private';
    const pub: SchoolChoice = 'public';
    if (legacyPlan === 'private') {
      return {
        kindergarten: priv,
        elementary: priv,
        juniorHigh: priv,
        highSchool: priv,
        university: priv,
        graduate: priv,
      };
    }
    if (legacyPlan === 'public') {
      return {
        kindergarten: pub,
        elementary: pub,
        juniorHigh: pub,
        highSchool: pub,
        university: pub,
        graduate: pub,
      };
    }
    return { ...d.children.path };
  };
  const choice = (v: unknown, fallback: SchoolChoice): SchoolChoice =>
    v === 'private' || v === 'public' ? v : fallback;

  return {
    incomeEvents: Array.isArray(o.incomeEvents)
      ? o.incomeEvents.slice(0, 40).map((e) => {
          const v = (e ?? {}) as Record<string, unknown>;
          return {
            id: str(v.id, newId(), 60),
            person: v.person === 'spouse' ? ('spouse' as const) : ('self' as const),
            yearsLater: num(v.yearsLater, 0),
            newIncome: num(v.newIncome, 0),
            kind: v.kind === 'benefit' ? ('benefit' as const) : ('salary' as const),
            label: str(v.label, '収入の変化', 30),
          };
        })
      : d.incomeEvents,
    bigExpenses: Array.isArray(o.bigExpenses)
      ? o.bigExpenses.slice(0, 40).map((e) => {
          const v = (e ?? {}) as Record<string, unknown>;
          return {
            id: str(v.id, newId(), 60),
            yearsLater: num(v.yearsLater, 0),
            amount: num(v.amount, 0),
            label: str(v.label, 'まとまった出費', 30),
            repeatYears: num(v.repeatYears, 0),
            untilAge: num(v.untilAge, 0),
            fundedBy: v.fundedBy === 'investment' ? ('investment' as const) : ('cash' as const),
          };
        })
      : d.bigExpenses,
    investmentChanges: Array.isArray(o.investmentChanges)
      ? o.investmentChanges.slice(0, 40).map((c) => {
          const v = (c ?? {}) as Record<string, unknown>;
          return {
            id: str(v.id, newId(), 60),
            yearsLater: num(v.yearsLater, 0),
            monthlyAmount: num(v.monthlyAmount, 0),
            label: str(v.label, '積立額の変更', 30),
          };
        })
      : d.investmentChanges,
    retirement: (() => {
      const r = (o.retirement ?? {}) as Record<string, unknown>;
      const dr = d.retirement;
      const strategy = str(r.strategy, dr.strategy);
      return {
        strategy:
          strategy === 'fixedAmount' ||
          strategy === 'fixedRate' ||
          strategy === 'cashOut' ||
          strategy === 'asNeeded'
            ? strategy
            : dr.strategy,
        contributionEndAge: num(r.contributionEndAge, dr.contributionEndAge),
        withdrawalStartAge: num(r.withdrawalStartAge, dr.withdrawalStartAge),
        fixedAmount: num(r.fixedAmount, dr.fixedAmount),
        fixedRate: num(r.fixedRate, dr.fixedRate),
        postReturnRate: num(r.postReturnRate, dr.postReturnRate),
      };
    })(),
    children: {
      // 旧形式（人数＋第1子の時期＋出産間隔）は 1 人ずつの誕生年へ読み替える
      births: Array.isArray(children.births)
        ? children.births
            .slice(0, 10)
            .map((b) => num(b, 0))
            .sort((a, b) => a - b)
        : (() => {
            const count = num(children.count, 0);
            const first = num(children.firstYearsLater, 2);
            const interval = num(children.interval, 3);
            return Array.from({ length: Math.max(0, Math.min(10, count)) }, (_, i) =>
              first + i * interval,
            );
          })(),
      careCosts: (() => {
        const c = (children.careCosts ?? {}) as Record<string, unknown>;
        const dc = d.children.careCosts;
        const parsed = {
          infant: num(c.infant, dc.infant),
          preschool: num(c.preschool, dc.preschool),
          elementary: num(c.elementary, dc.elementary),
          juniorHigh: num(c.juniorHigh, dc.juniorHigh),
          highSchool: num(c.highSchool, dc.highSchool),
          university: num(c.university, dc.university),
        };
        // 旧既定値のまま保存されたデータは、調整した結果ではなく既定値なので新しい既定値へ移行する
        const isLegacyDefault = (
          Object.keys(legacyCareCosts) as (keyof typeof legacyCareCosts)[]
        ).every((k) => parsed[k] === legacyCareCosts[k]);
        return isLegacyDefault ? { ...dc } : parsed;
      })(),
      educationCosts: (() => {
        const e = (children.educationCosts ?? {}) as Record<string, unknown>;
        const de = d.children.educationCosts;
        const table = (raw2: unknown, fallback: EducationCostTable): EducationCostTable => {
          const t = (raw2 ?? {}) as Record<string, unknown>;
          return {
            kindergarten: num(t.kindergarten, fallback.kindergarten),
            elementary: num(t.elementary, fallback.elementary),
            juniorHigh: num(t.juniorHigh, fallback.juniorHigh),
            highSchool: num(t.highSchool, fallback.highSchool),
            university: num(t.university, fallback.university),
            graduate: num(t.graduate, fallback.graduate),
          };
        };
        return {
          public: table(e.public, de.public),
          private: table(e.private, de.private),
        };
      })(),
      graduateYears: num(children.graduateYears, d.children.graduateYears),
      path: (() => {
        const base = legacyPath();
        const p = (children.path ?? {}) as Record<string, unknown>;
        return {
          kindergarten: choice(p.kindergarten, base.kindergarten),
          elementary: choice(p.elementary, base.elementary),
          juniorHigh: choice(p.juniorHigh, base.juniorHigh),
          highSchool: choice(p.highSchool, base.highSchool),
          university: choice(p.university, base.university),
          graduate: choice(p.graduate, base.graduate),
        };
      })(),
      finalStage: (() => {
        const f = str(children.finalStage, '');
        if (f === 'highSchool' || f === 'university' || f === 'graduate') return f;
        // 旧形式の「大学院に進む」フラグから読み替える
        return children.graduateSchool === true ? 'graduate' : d.children.finalStage;
      })(),
    },
    housing: {
      planned: bool(housing.planned, d.housing.planned),
      yearsLater: num(housing.yearsLater, d.housing.yearsLater),
      price: num(housing.price, d.housing.price),
      downPayment: num(housing.downPayment, d.housing.downPayment),
      // 旧形式は「返済期間」だったので、購入時の年齢を足して完済年齢にする
      payoffAge:
        housing.payoffAge === undefined && housing.loanYears !== undefined
          ? (info?.age ?? defaultBasicInfo.age) +
            num(housing.yearsLater, d.housing.yearsLater) +
            num(housing.loanYears, 0)
          : num(housing.payoffAge, d.housing.payoffAge),
      loanRate: num(housing.loanRate, d.housing.loanRate),
      fundedBy: housing.fundedBy === 'investment' ? ('investment' as const) : ('cash' as const),
      taxCredit: bool(housing.taxCredit, d.housing.taxCredit),
      creditYears: num(housing.creditYears, d.housing.creditYears),
      creditRate: num(housing.creditRate, d.housing.creditRate),
      creditLimit: num(housing.creditLimit, d.housing.creditLimit),
    },
    // 旧形式（moving: 単一の引越し）は 1 件のリストへ読み替える
    moves: Array.isArray(o.moves)
      ? o.moves.slice(0, 20).map((m) => {
          const v = (m ?? {}) as Record<string, unknown>;
          return {
            id: str(v.id, newId(), 60),
            yearsLater: num(v.yearsLater, 0),
            monthlyRent: num(v.monthlyRent, defaultBasicInfo.rent),
            initialCostMonths: num(v.initialCostMonths, 4),
            label: str(v.label, '引越し', 30),
          };
        })
      : bool(moving.planned, false)
        ? [
            {
              id: newId(),
              yearsLater: num(moving.yearsLater, 3),
              monthlyRent: num(moving.newRent, 14),
              initialCostMonths: 4,
              label: '引越し',
            },
          ]
        : [],
  };
}

function parsePlan(raw: unknown): SavedPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: str(o.id, newId(), 60),
    name: str(o.name, '無題のプラン', 60),
    createdAt: str(o.createdAt, now, 40),
    updatedAt: str(o.updatedAt, now, 40),
    info: parseInfo(o.info),
    answers: parseAnswers(o.answers, parseInfo(o.info)),
  };
}

export function loadPlans(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parsePlan)
      .filter((p): p is SavedPlan => p !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

/** 保存に成功したら true。容量超過やプライベートモードでは false */
export function savePlans(plans: SavedPlan[]): boolean {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    return true;
  } catch {
    return false;
  }
}

/** 家族構成や住宅の予定から、保存時の名前の候補をつくる */
export function suggestName(info: BasicInfo, answers: PlanAnswers, existing: SavedPlan[]): string {
  const parts: string[] = [`${info.age}歳`];
  parts.push(info.hasSpouse ? '夫婦' : '単身');
  const totalChildren = info.children.length + (answers.children.births?.length ?? 0);
  if (totalChildren > 0) parts.push(`子${totalChildren}人`);
  if (answers.housing.planned) parts.push('住宅購入');
  else parts.push('賃貸');
  const base = parts.join('・');
  if (!existing.some((p) => p.name === base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}（${i}）`;
    if (!existing.some((p) => p.name === candidate)) return candidate;
  }
  return base;
}

export interface ExportFile {
  format: string;
  version: number;
  exportedAt: string;
  plans: SavedPlan[];
}

export function buildExport(plans: SavedPlan[]): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    plans,
  };
}

/** 読み込んだ JSON からプランを取り出す。形式が違えば空配列 */
export function parseImport(text: string): SavedPlan[] {
  const parsed = JSON.parse(text) as unknown;
  const source = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>)?.plans as unknown);
  if (!Array.isArray(source)) return [];
  return source
    .slice(0, 200)
    .map(parsePlan)
    .filter((p): p is SavedPlan => p !== null);
}

export async function downloadJson(data: unknown, filename: string): Promise<SaveResult> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  return saveFile(blob, filename);
}

/* ------------------------------------------------------------------ *
 * 保存した内容と、いまの条件の差分
 * ------------------------------------------------------------------ */

export interface PlanDiff {
  label: string;
  before: string;
  after: string;
}

const HOME_TYPE_LABEL: Record<string, string> = {
  family: '実家',
  rent: '賃貸',
  owned: '持ち家',
};

const FINAL_STAGE_LABEL: Record<string, string> = {
  highSchool: '高校卒',
  university: '大学卒',
  graduate: '大学院卒',
};

const STRATEGY_LABEL: Record<string, string> = {
  asNeeded: '必要な分だけ',
  fixedAmount: '毎年決まった額',
  fixedRate: '毎年決まった率',
  cashOut: '全額を現金化',
};

const SCHOOL_LABEL: Record<string, string> = { public: '公立', private: '私立' };

/** 「保存したときの条件」と「いまの条件」を並べて、変わった項目だけ返す */
export function diffPlan(
  saved: { info: BasicInfo; answers: PlanAnswers },
  current: { info: BasicInfo; answers: PlanAnswers },
): PlanDiff[] {
  const diffs: PlanDiff[] = [];
  const push = (label: string, before: unknown, after: unknown) => {
    if (String(before) === String(after)) return;
    diffs.push({ label, before: String(before), after: String(after) });
  };

  const a = saved.info;
  const b = current.info;
  const man = (v: number) => `${v}万円`;
  const pct = (v: number) => `${v}%`;

  push('あなたの年齢', `${a.age}歳`, `${b.age}歳`);
  push('配偶者', a.hasSpouse ? 'いる' : 'いない', b.hasSpouse ? 'いる' : 'いない');
  push('配偶者の年齢', `${a.spouseAge}歳`, `${b.spouseAge}歳`);
  push('あなたの年収', man(a.income), man(b.income));
  push('配偶者の年収', man(a.spouseIncome), man(b.spouseIncome));
  push('現在のお子さん', `${a.children.length}人`, `${b.children.length}人`);
  push('住まい', HOME_TYPE_LABEL[a.homeType], HOME_TYPE_LABEL[b.homeType]);
  push('住居費', `月${a.rent}万円`, `月${b.rent}万円`);
  push('ローンの完済年齢', `${a.loanPayoffAge}歳`, `${b.loanPayoffAge}歳`);
  push('持ち家の維持費', `月${a.homeUpkeepMonthly}万円`, `月${b.homeUpkeepMonthly}万円`);
  push('大人の生活費', `月${a.livingCost}万円`, `月${b.livingCost}万円`);
  push('現金・預金', man(a.cash), man(b.cash));
  push('投資資産', man(a.investments), man(b.investments));
  push('預金金利', pct(a.cashRate), pct(b.cashRate));
  push('投資の想定利回り', pct(a.investmentRate), pct(b.investmentRate));
  push('毎月の積立額', `月${a.monthlyInvestment}万円`, `月${b.monthlyInvestment}万円`);
  push('iDeCoの掛金', `月${a.idecoMonthly}万円`, `月${b.idecoMonthly}万円`);
  push('iDeCoの残高', man(a.idecoBalance), man(b.idecoBalance));
  push('昇給率', pct(a.raiseRate), pct(b.raiseRate));
  push('物価上昇率', pct(a.inflationRate), pct(b.inflationRate));
  push('退職年齢', `${a.retireAge}歳`, `${b.retireAge}歳`);
  push('退職金', man(a.retirementPay), man(b.retirementPay));
  push('年金', `月${a.pensionMonthly}万円`, `月${b.pensionMonthly}万円`);

  const x = saved.answers;
  const y = current.answers;

  push('これから生まれるお子さん', `${x.children.births.length}人`, `${y.children.births.length}人`);
  if (x.children.births.join(',') !== y.children.births.join(',')) {
    push(
      'お子さんの誕生時期',
      x.children.births.map((v) => `${v}年後`).join('・') || 'なし',
      y.children.births.map((v) => `${v}年後`).join('・') || 'なし',
    );
  }
  push(
    '最終学歴',
    FINAL_STAGE_LABEL[x.children.finalStage],
    FINAL_STAGE_LABEL[y.children.finalStage],
  );
  (Object.keys(x.children.path) as (keyof typeof x.children.path)[]).forEach((key) => {
    const names: Record<string, string> = {
      kindergarten: '幼稚園',
      elementary: '小学校',
      juniorHigh: '中学校',
      highSchool: '高校',
      university: '大学',
      graduate: '大学院',
    };
    push(
      `進路（${names[key]}）`,
      SCHOOL_LABEL[x.children.path[key]],
      SCHOOL_LABEL[y.children.path[key]],
    );
  });

  push('住宅購入', x.housing.planned ? 'する' : 'しない', y.housing.planned ? 'する' : 'しない');
  if (x.housing.planned || y.housing.planned) {
    push('購入時期', `${x.housing.yearsLater}年後`, `${y.housing.yearsLater}年後`);
    push('物件価格', man(x.housing.price), man(y.housing.price));
    push('頭金', man(x.housing.downPayment), man(y.housing.downPayment));
    push('ローンの完済年齢', `${x.housing.payoffAge}歳`, `${y.housing.payoffAge}歳`);
    push('借入金利', pct(x.housing.loanRate), pct(y.housing.loanRate));
    push('住宅ローン控除', x.housing.taxCredit ? '使う' : '使わない', y.housing.taxCredit ? '使う' : '使わない');
  }

  push('収入の変化', `${x.incomeEvents.length}件`, `${y.incomeEvents.length}件`);
  push('引越し', `${x.moves.length}件`, `${y.moves.length}件`);
  push('大型出費', `${x.bigExpenses.length}件`, `${y.bigExpenses.length}件`);
  push('積立額の変更', `${x.investmentChanges.length}件`, `${y.investmentChanges.length}件`);

  push(
    '老後の取り崩し方',
    STRATEGY_LABEL[x.retirement.strategy],
    STRATEGY_LABEL[y.retirement.strategy],
  );
  push('積立をやめる年齢', `${x.retirement.contributionEndAge}歳`, `${y.retirement.contributionEndAge}歳`);
  push('取り崩しを始める年齢', `${x.retirement.withdrawalStartAge}歳`, `${y.retirement.withdrawalStartAge}歳`);
  push('取り崩し後の利回り', pct(x.retirement.postReturnRate), pct(y.retirement.postReturnRate));

  return diffs;
}
