import {
  annualLoanPayment,
  careCostFor,
  childAllowance,
  educationCost,
  supportEndAgeFor,
  takeHomeFromPension,
  takeHomeFromSalary,
} from './finance';
import { defaultAnswers, defaultCareCosts, defaultEducationCosts } from './defaults';
import type { BasicInfo, PlanAnswers, SimulationResult, YearRow } from './types';

const PENSION_START_AGE = 65;
const END_AGE = 95;
/** 持ち家の維持費（固定資産税・修繕積立・保険）は物件価格に対する年率で概算 */
const HOME_UPKEEP_RATE = 0.01;
/** 住宅購入時の諸費用（仲介手数料・登記・税金など） */
const PURCHASE_FEE_RATE = 0.07;
/** 退職後の生活費の縮小率 */
const RETIRED_LIVING_RATIO = 0.85;

/** 将来生まれる子どもの「今年時点の年齢」。まだ生まれていなければ null */
function futureChildAge(t: number, birthYear: number): number | null {
  return t >= birthYear ? t - birthYear : null;
}

/**
 * 同じ人・同じ年のイベントは後に追加したものを優先して 1 件にまとめる。
 * Excel 側は「その年の値」を 1 つしか持てないため、両者の計算を一致させるために必要。
 */
export function normalizeIncomeEvents(events: PlanAnswers['incomeEvents']): PlanAnswers['incomeEvents'] {
  const byKey = new Map<string, PlanAnswers['incomeEvents'][number]>();
  events.forEach((e) => byKey.set(`${e.person}:${e.yearsLater}`, e));
  return [...byKey.values()].sort(
    (a, b) => a.yearsLater - b.yearsLater || (a.person === 'self' ? -1 : 1),
  );
}

export function simulate(info: BasicInfo, answers: PlanAnswers): SimulationResult {
  const incomeEvents = normalizeIncomeEvents(answers.incomeEvents);
  // 引越しは発生年の早い順に適用する
  const moves = (answers.moves ?? []).slice().sort((a, b) => a.yearsLater - b.yearsLater);
  // 積立額の変更も同じく、その年までで最後のものを適用する
  const investmentChanges = (answers.investmentChanges ?? [])
    .slice()
    .sort((a, b) => a.yearsLater - b.yearsLater);
  const monthlyInvestmentAt = (t: number): number => {
    const applied = investmentChanges.filter((c) => c.yearsLater <= t);
    const last = applied[applied.length - 1];
    return last ? last.monthlyAmount : info.monthlyInvestment;
  };
  // 古い保存データには養育費の設定がないことがある
  const careCosts = answers.children.careCosts ?? defaultCareCosts;
  const educationCosts = answers.children.educationCosts ?? defaultEducationCosts;
  const retirement = answers.retirement ?? defaultAnswers.retirement;
  // 最終学歴までの期間だけ、教育費と養育費を計上する
  const path = answers.children.path ?? defaultAnswers.children.path;
  const finalStage = answers.children.finalStage ?? defaultAnswers.children.finalStage;
  const graduateYears = answers.children.graduateYears ?? 2;
  const supportEndAge = supportEndAgeFor(finalStage, graduateYears);
  const thisYear = new Date().getFullYear();
  const years = Math.max(1, END_AGE - info.age);
  const raise = info.raiseRate / 100;
  const cashRate = info.cashRate / 100;
  const investRate = info.investmentRate / 100;

  // 額面年収（収入イベントを反映）。給付金は非課税・昇給なしで扱う
  const incomeAt = (person: 'self' | 'spouse', t: number): { amount: number; taxFree: boolean } => {
    const base = person === 'self' ? info.income : info.spouseIncome;
    const applied = incomeEvents
      .filter((e) => e.person === person && e.yearsLater <= t)
      .sort((a, b) => a.yearsLater - b.yearsLater);
    const last = applied[applied.length - 1];
    if (!last) return { amount: base * Math.pow(1 + raise, t), taxFree: false };
    if (last.kind === 'benefit') return { amount: last.newIncome, taxFree: true };
    return { amount: last.newIncome * Math.pow(1 + raise, t - last.yearsLater), taxFree: false };
  };

  // 住宅ローン
  const loanPrincipal = answers.housing.planned
    ? Math.max(0, answers.housing.price - answers.housing.downPayment)
    : 0;
  const loanPayment = annualLoanPayment(
    loanPrincipal,
    answers.housing.loanYears,
    answers.housing.loanRate,
  );

  // これから生まれる子の出生タイミング（経過年）
  const futureBirths = (answers.children.births ?? []).slice().sort((a, b) => a - b);

  const rows: YearRow[] = [];
  let cash = info.cash;
  let investments = info.investments;

  for (let t = 0; t <= years; t += 1) {
    const age = info.age + t;
    const spouseAge = info.spouseAge + t;
    const events: string[] = [];

    // ---- 収入 ----
    let workIncome = 0;
    let benefitIncome = 0;
    let selfGross = 0;
    let spouseGross = 0;
    if (age < info.retireAge) {
      const self = incomeAt('self', t);
      selfGross = self.amount;
      if (self.taxFree) benefitIncome += self.amount;
      else workIncome += takeHomeFromSalary(self.amount);
    }
    if (info.hasSpouse && spouseAge < info.retireAge) {
      const spouse = incomeAt('spouse', t);
      spouseGross = spouse.amount;
      if (spouse.taxFree) benefitIncome += spouse.amount;
      else workIncome += takeHomeFromSalary(spouse.amount);
    }

    const pensionIncome =
      age >= PENSION_START_AGE ? takeHomeFromPension(info.pensionMonthly * 12) : 0;

    let lumpIncome = 0;
    if (age === info.retireAge && info.retirementPay > 0) {
      lumpIncome += info.retirementPay;
    }

    // ---- 子ども ----
    const childAges: number[] = [];
    info.children.forEach((c) => childAges.push(c.age + t));
    futureBirths.forEach((birth) => {
      const a = futureChildAge(t, birth);
      if (a !== null) childAges.push(a);
    });
    const dependents = childAges.filter((a) => a <= 21);
    const allowance = childAllowance(dependents.slice().sort((a, b) => b - a));

    // ---- 支出 ----
    // 大人の生活費に、子ども 1 人ずつの養育費を積み上げる
    const baseLiving =
      info.livingCost * 12 * (age >= info.retireAge ? RETIRED_LIVING_RATIO : 1);
    const childCost = childAges.reduce(
      (sum, a) => sum + careCostFor(a, careCosts, supportEndAge),
      0,
    );
    const living = Math.max(0, baseLiving + childCost);

    // 住居費：購入後は持ち家、それ以前は直近の引越し先の家賃
    let housingCost: number;
    let lumpExpense = 0;
    let investmentFunded = 0;
    const owned = answers.housing.planned && t >= answers.housing.yearsLater;
    if (owned) {
      const sincePurchase = t - answers.housing.yearsLater;
      const paying = sincePurchase < answers.housing.loanYears;
      housingCost = (paying ? loanPayment : 0) + answers.housing.price * HOME_UPKEEP_RATE;
      if (sincePurchase === 0) {
        const upfront = answers.housing.downPayment + answers.housing.price * PURCHASE_FEE_RATE;
        lumpExpense += upfront;
        if (answers.housing.fundedBy === 'investment') investmentFunded += upfront;
        events.push('住宅購入');
      }
      if (sincePurchase === answers.housing.loanYears) events.push('ローン完済');
    } else {
      // 適用中の引越し先（複数回の引越しのうち、その年までで最後のもの）
      const applied = moves.filter((m) => m.yearsLater <= t);
      const current = applied[applied.length - 1];
      if (current) {
        // 引越したあとは賃貸
        housingCost = current.monthlyRent * 12;
      } else if (info.homeType === 'owned') {
        // すでに持ち家：残りの返済期間だけ返済額がかかり、維持費はその後も続く
        const paying = t < info.loanRemainingYears;
        housingCost = (paying ? info.rent : 0) * 12 + info.homeUpkeepMonthly * 12;
        if (info.loanRemainingYears > 0 && t === info.loanRemainingYears) {
          events.push('ローン完済');
        }
      } else {
        housingCost = info.rent * 12;
      }
      moves
        .filter((m) => m.yearsLater === t)
        .forEach((m) => {
          lumpExpense += m.monthlyRent * m.initialCostMonths;
          events.push(m.label || '引越し');
        });
    }

    // 大型出費（単発と、車の買い替えのような繰り返し）
    let bigExpense = 0;
    investmentChanges
      .filter((c) => c.yearsLater === t)
      .forEach((c) => events.push(c.label || '積立額の変更'));

    answers.bigExpenses.forEach((e) => {
      if (t < e.yearsLater || e.amount <= 0) return;
      // 「◯歳まで」を指定した繰り返しは、その年齢を過ぎたら発生させない
      if (e.repeatYears > 0 && (e.untilAge ?? 0) > 0 && age > e.untilAge) return;
      const hit =
        e.repeatYears > 0 ? (t - e.yearsLater) % e.repeatYears === 0 : t === e.yearsLater;
      if (hit) {
        bigExpense += e.amount;
        if (e.fundedBy === 'investment') investmentFunded += e.amount;
        // 繰り返す出費は初回だけラベルを出す（毎回出すとグラフが埋まるため）
        if (e.repeatYears > 0) {
          if (t === e.yearsLater) events.push(`${e.label}（${e.repeatYears}年ごと）`);
        } else {
          events.push(e.label);
        }
      }
    });

    const education = childAges.reduce(
      (sum, a) => sum + educationCost(a, path, finalStage, educationCosts, graduateYears),
      0,
    );

    // ---- イベントラベル ----
    incomeEvents.filter((e) => e.yearsLater === t).forEach((e) => events.push(e.label));
    futureBirths.forEach((birth, i) => {
      if (t === birth) events.push(`第${info.children.length + i + 1}子誕生`);
    });
    if (age === info.retireAge) events.push('退職');
    if (age === PENSION_START_AGE) events.push('年金受給開始');
    childAges.forEach((a) => {
      if (a === 18) events.push('大学入学');
    });

    // ---- 集計 ----
    const income = workIncome + benefitIncome + pensionIncome + allowance + lumpIncome;
    const expense = living + housingCost + education + lumpExpense + bigExpense;
    const balance = income - expense;

    // 現金と投資は別々に回す。現金には預金金利、投資には想定利回りを適用し、
    // 積立は現金から投資へ振り替える（現金が足りない年は積立を止める）。
    // 取り崩し開始後は、リスクを落とす前提の利回りに切り替える。
    const drawing = age >= retirement.withdrawalStartAge;
    const yearReturn = drawing ? retirement.postReturnRate / 100 : investRate;
    const cashInterest = cash > 0 ? cash * cashRate : 0;
    const investmentGain = investments > 0 ? investments * yearReturn : 0;
    const cashBeforeContribution = cash + cashInterest + balance;
    // 積立は設定した年齢で止める
    const monthlyInvestment = monthlyInvestmentAt(t);
    const contribution =
      age < retirement.contributionEndAge
        ? Math.max(0, Math.min(monthlyInvestment * 12, cashBeforeContribution))
        : 0;
    const investAfterContribution = investments + investmentGain + contribution;

    // 「投資から払う」と指定した支出のぶんを先に取り崩す
    const expenseWithdrawal = Math.max(0, Math.min(investAfterContribution, investmentFunded));
    const investAfterExpense = investAfterContribution - expenseWithdrawal;

    // 出口戦略にもとづく計画的な取り崩し
    let plannedWithdrawal = 0;
    if (drawing && investAfterExpense > 0) {
      if (retirement.strategy === 'fixedAmount') {
        plannedWithdrawal = Math.min(investAfterExpense, retirement.fixedAmount);
      } else if (retirement.strategy === 'fixedRate') {
        plannedWithdrawal = investAfterExpense * (retirement.fixedRate / 100);
      } else if (retirement.strategy === 'cashOut' && age === retirement.withdrawalStartAge) {
        plannedWithdrawal = investAfterExpense;
      }
    }
    if (retirement.strategy === 'cashOut' && age === retirement.withdrawalStartAge) {
      events.push('投資を全額現金化');
    }

    let nextCash = cashBeforeContribution - contribution + expenseWithdrawal + plannedWithdrawal;
    let nextInvestments = investAfterExpense - plannedWithdrawal;

    // それでも現金が足りない年は、不足分だけ追加で取り崩す
    const withdrawal = nextCash < 0 ? Math.min(nextInvestments, -nextCash) : 0;
    nextCash += withdrawal;
    nextInvestments -= withdrawal;

    cash = nextCash;
    investments = nextInvestments;
    const totalAssets = cash + investments;

    rows.push({
      t,
      year: thisYear + t,
      age,
      income,
      workIncome,
      benefitIncome,
      selfGross,
      spouseGross,
      pensionIncome,
      allowance,
      lumpIncome,
      expense,
      living,
      housing: housingCost,
      education,
      lumpExpense,
      bigExpense,
      balance,
      contribution,
      expenseWithdrawal,
      plannedWithdrawal,
      withdrawal,
      cashInterest,
      investmentGain,
      cash,
      investments,
      totalAssets,
      childCount: dependents.length,
      events,
    });
  }

  const depletion = rows.find((r) => r.totalAssets < 0) ?? null;
  const minRow = rows.reduce((a, b) => (b.totalAssets < a.totalAssets ? b : a), rows[0]);
  const maxRow = rows.reduce((a, b) => (b.totalAssets > a.totalAssets ? b : a), rows[0]);
  const atRetirement = rows.find((r) => r.age === info.retireAge) ?? null;

  return {
    rows,
    depletion,
    minRow,
    maxRow,
    atRetirement,
    final: rows[rows.length - 1],
    annualLoanPayment: loanPayment,
  };
}
