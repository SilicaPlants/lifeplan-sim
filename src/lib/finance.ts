/** 税・社会保険・教育費など、シミュレーションの基礎となる概算計算。単位は万円。 */

import type { CareCostTable, EducationCosts, EducationPath, FinalStage } from './types';

/** 給与所得控除（令和7年度税制改正で最低保障額が 55 万円→65 万円） */
function salaryDeduction(gross: number): number {
  if (gross <= 162.5) return Math.min(gross, 65);
  if (gross <= 180) return gross * 0.4 - 10;
  if (gross <= 360) return gross * 0.3 + 8;
  if (gross <= 660) return gross * 0.2 + 44;
  if (gross <= 850) return gross * 0.1 + 110;
  return 195;
}

/**
 * 社会保険料の概算（健康保険・厚生年金・雇用保険の本人負担、約14.7%・上限あり）。
 * 年収 106 万円未満は加入対象外とみなす（実際は勤務先の規模や労働時間による）。
 */
const SOCIAL_INSURANCE_THRESHOLD = 106;

function socialInsurance(gross: number): number {
  if (gross < SOCIAL_INSURANCE_THRESHOLD) return 0;
  const capped = Math.min(gross, 1000);
  return capped * 0.147 + Math.max(0, gross - capped) * 0.02;
}

/** 所得税（復興特別所得税込み）の速算表 */
function incomeTax(taxable: number): number {
  const t = Math.max(0, taxable);
  let tax: number;
  if (t <= 195) tax = t * 0.05;
  else if (t <= 330) tax = t * 0.1 - 9.75;
  else if (t <= 695) tax = t * 0.2 - 42.75;
  else if (t <= 900) tax = t * 0.23 - 63.6;
  else if (t <= 1800) tax = t * 0.33 - 153.6;
  else if (t <= 4000) tax = t * 0.4 - 279.6;
  else tax = t * 0.45 - 479.6;
  return tax * 1.021;
}

/** 額面年収から手取り年収を概算する（給与所得者・扶養控除は考慮しない簡易計算） */
export function takeHomeFromSalary(gross: number): number {
  if (gross <= 0) return 0;
  const si = socialInsurance(gross);
  const afterSalaryDeduction = gross - salaryDeduction(gross);
  // 基礎控除は令和7年度税制改正後の恒久分 58 万円（所得により上乗せがあるが、
  // 税を多めに見積もる側に倒して恒久分だけを使う）。住民税は 43 万円のまま。
  const taxableIncome = Math.max(0, afterSalaryDeduction - si - 58);
  const taxableResident = Math.max(0, afterSalaryDeduction - si - 43);
  // 均等割は市町村3,500円＋道府県1,500円＋森林環境税1,000円
  const resident = taxableResident * 0.1 + 0.6;
  return Math.max(0, gross - si - incomeTax(taxableIncome) - resident);
}

/** 年金の手取り（公的年金等控除・社会保険料を考慮した概算：額面の約 90%） */
export function takeHomeFromPension(gross: number): number {
  if (gross <= 0) return 0;
  if (gross <= 180) return gross * 0.94;
  return gross * 0.88;
}

/** 児童手当（年額）。0〜2歳は月1.5万、3歳〜高校生は月1万、第3子以降は月3万 */
export function childAllowance(childAges: number[]): number {
  let total = 0;
  childAges.forEach((age, index) => {
    if (age > 18) return;
    const third = index >= 2;
    const monthly = third ? 3 : age <= 2 ? 1.5 : 1;
    total += monthly * 12;
  });
  return total;
}

export type EducationStage =
  | 'none'
  | 'kindergarten'
  | 'elementary'
  | 'juniorHigh'
  | 'highSchool'
  | 'university';

export function stageOf(age: number): EducationStage {
  if (age < 3) return 'none';
  if (age <= 5) return 'kindergarten';
  if (age <= 11) return 'elementary';
  if (age <= 14) return 'juniorHigh';
  if (age <= 17) return 'highSchool';
  if (age <= 21) return 'university';
  return 'none';
}

/** 最終学歴から、教育費・養育費を計上する上限の年齢を求める */
export function supportEndAgeFor(finalStage: FinalStage, graduateYears: number): number {
  if (finalStage === 'highSchool') return 17;
  if (finalStage === 'university') return 21;
  return 21 + Math.max(0, graduateYears);
}

/**
 * その年の教育費。通学費・制服・給食費・塾代を含む学習費ベースのため、
 * 公立と私立の差はこの関数（＝教育費テーブル）が担い、養育費は方針によらず一定にしている。
 */
/** 大学院の入学金・受験費用（万円） */
export const GRADUATE_ENTRY_FEE = 20;

export function educationCost(
  age: number,
  path: EducationPath,
  finalStage: FinalStage,
  costs: EducationCosts,
  graduateYears = 2,
): number {
  const endAge = supportEndAgeFor(finalStage, graduateYears);
  if (age > endAge) return 0;

  // 22歳以降は大学院
  if (age >= 22) {
    const table = path.graduate === 'private' ? costs.private : costs.public;
    return table.graduate + (age === 22 ? GRADUATE_ENTRY_FEE : 0);
  }

  const stage = stageOf(age);
  if (stage === 'none') return 0;
  const table = path[stage] === 'private' ? costs.private : costs.public;
  let cost = table[stage];
  // 入学年は入学金・受験費用を上乗せ
  if (age === 18) cost += path.university === 'private' ? 30 : 15;
  if (age === 15 && path.highSchool === 'private') cost += 15;
  if (age === 12 && path.juniorHigh === 'private') cost += 20;
  return cost;
}

/**
 * 子ども 1 人あたりの養育費（年額）。教育費以外の食費・被服費・小遣いに加え、
 * 世帯人数が増えることによる光熱費・通信費の増加分も含む想定。
 */
export function careCostFor(age: number, table: CareCostTable, supportEndAge = 21): number {
  if (age < 0 || age > supportEndAge) return 0;
  if (age <= 2) return table.infant;
  if (age <= 5) return table.preschool;
  if (age <= 11) return table.elementary;
  if (age <= 14) return table.juniorHigh;
  if (age <= 17) return table.highSchool;
  return table.university;
}

/** 元利均等返済の年間返済額 */
export function annualLoanPayment(principal: number, years: number, ratePercent: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = ratePercent / 100 / 12;
  const n = years * 12;
  const monthly = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
}
