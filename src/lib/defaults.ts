import type {
  BasicInfo,
  CareCostTable,
  EducationCosts,
  EducationPath,
  PlanAnswers,
} from './types';

/** 既定の進路：大学だけ私立、それ以外は公立 */
export const defaultEducationPath: EducationPath = {
  kindergarten: 'public',
  elementary: 'public',
  juniorHigh: 'public',
  highSchool: 'public',
  university: 'private',
  graduate: 'private',
};

/**
 * 子ども 1 人あたりの養育費（年額・万円）の既定値。
 * 内閣府「子育て費用に関する調査」の年間子育て費用から、保育料・学校教育費・
 * 学校外教育費といった教育関連（本アプリでは教育費として別に計上する分）を差し引き、
 * 近年の物価上昇を加味した目安。0〜21 歳の合計で 1 人あたり約 1,870 万円。
 * 食費・衣類・医療費・生活用品・おこづかい・レジャー費に加え、
 * 世帯人数が増えることによる光熱費や通信費の増加分も含む想定。
 */
export const defaultCareCosts: CareCostTable = {
  infant: 70,
  preschool: 75,
  elementary: 80,
  juniorHigh: 90,
  highSchool: 95,
  university: 100,
};

/**
 * 2026 年 9 月の見直し前の既定値。
 * 当時の既定値のまま保存されたデータを、新しい既定値へ引き上げるためだけに使う。
 */
export const legacyCareCosts: CareCostTable = {
  infant: 55,
  preschool: 60,
  elementary: 65,
  juniorHigh: 75,
  highSchool: 80,
  university: 85,
};

/**
 * 学齢ごとの教育費（年額・万円）の既定値。
 * 文部科学省「子供の学習費調査」の学習費総額（授業料などの学校教育費＋給食費＋
 * 塾や習い事の学校外活動費）と、大学は日本学生支援機構の学生生活調査をもとにした目安。
 * 通学費・制服・給食費・塾代はここに含まれるため、養育費とは重複しない。
 */
export const defaultEducationCosts: EducationCosts = {
  public: {
    kindergarten: 17,
    elementary: 34,
    juniorHigh: 54,
    highSchool: 60,
    university: 70,
    graduate: 70,
  },
  private: {
    kindergarten: 31,
    elementary: 183,
    juniorHigh: 156,
    highSchool: 103,
    university: 125,
    graduate: 110,
  },
};

/**
 * 初期値は公的統計の平均・中央値に寄せている。
 * 年収：国税庁「民間給与実態統計調査」の30代の平均、生活費：総務省「家計調査」から
 * 住居費・教育費・子どもの養育費を除いた大人2人分、金融資産：金融広報中央委員会の
 * 30代の中央値、年金：厚生労働省のモデル年金（夫婦2人）を目安にしている。
 */
export const defaultBasicInfo: BasicInfo = {
  age: 32,
  hasSpouse: true,
  spouseAge: 31,
  income: 520,
  spouseIncome: 380,
  children: [],
  homeType: 'rent',
  // 民営借家の全国平均は5〜6万円、首都圏は8〜10万円。中間をとる
  rent: 9,
  loanPayoffAge: 62, // 32歳であと30年
  // マンションの管理費＋修繕積立金＋固定資産税の目安
  homeUpkeepMonthly: 2.5,
  livingCost: 22,
  // 30代二人以上世帯の金融資産保有額は中央値200万円台・平均500万円台
  cash: 300,
  investments: 100,
  cashRate: 0.2,
  investmentRate: 4,
  monthlyInvestment: 5,
  idecoMonthly: 0,
  idecoBalance: 0,
  raiseRate: 1.5,
  // 既定では物価上昇を見込まない（名目のまま試算する）。
  // 実質的な購買力で見たい場合は 1〜2% を設定する
  inflationRate: 0,
  retireAge: 65,
  retirementPay: 1200,
  // 厚生労働省のモデル年金（夫婦2人の標準的な年金額）は月23万円前後
  pensionMonthly: 23,
};

export const defaultAnswers: PlanAnswers = {
  incomeEvents: [],
  bigExpenses: [],
  investmentChanges: [],
  retirement: {
    strategy: 'asNeeded',
    contributionEndAge: 65,
    withdrawalStartAge: 65,
    fixedAmount: 120,
    fixedRate: 4,
    postReturnRate: 3,
  },
  children: {
    births: [2],
    path: defaultEducationPath,
    finalStage: 'university',
    careCosts: defaultCareCosts,
    educationCosts: defaultEducationCosts,
    graduateYears: 2,
  },
  housing: {
    planned: false,
    yearsLater: 5,
    price: 4500,
    downPayment: 500,
    payoffAge: 72, // 37歳（5年後）に買って35年返済
    // 変動金利は0.7〜1.0%、フラット35は2%前後。将来の金利上昇も見込んで中間をとる
    loanRate: 1.5,
    fundedBy: 'cash',
    taxCredit: true,
    // 新築は13年、中古は10年。控除率0.7%、借入限度額は住宅の省エネ性能で変わる
    creditYears: 13,
    creditRate: 0.7,
    creditLimit: 3000,
  },
  moves: [],
};
