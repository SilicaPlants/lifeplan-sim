/** 金額の単位はすべて「万円」、期間は「年」で統一する。 */

export type SchoolChoice = 'public' | 'private';

/** 進学段階ごとの公立・私立の選択 */
export interface EducationPath {
  kindergarten: SchoolChoice;
  elementary: SchoolChoice;
  juniorHigh: SchoolChoice;
  highSchool: SchoolChoice;
  university: SchoolChoice;
  graduate: SchoolChoice;
}

/** 最終学歴。これ以降の教育費と養育費は計上しない */
export type FinalStage = 'highSchool' | 'university' | 'graduate';

export interface ChildInput {
  /** 現在の年齢（歳）。0 は当年生まれ */
  age: number;
}

export interface BasicInfo {
  age: number;
  hasSpouse: boolean;
  spouseAge: number;
  /** 本人の額面年収 */
  income: number;
  /** 配偶者の額面年収 */
  spouseIncome: number;
  children: ChildInput[];
  /** 現在の住まいの種類。金額の扱いは同じで、表示ラベルが変わる */
  homeType: 'family' | 'rent' | 'owned';
  /** 月あたりの住居費（賃貸なら家賃、実家なら家に入れている金額、持ち家ならローン返済額） */
  rent: number;
  /** すでに持ち家の場合の、住宅ローンの残り返済年数（0 なら完済済み） */
  loanRemainingYears: number;
  /** 持ち家の維持費（固定資産税・修繕積立・保険）の月額。完済後も続く */
  homeUpkeepMonthly: number;
  /** 大人（本人・配偶者）の月あたりの生活費。住居費・教育費・子どもの養育費を除く */
  livingCost: number;
  /** 現在の現金・預金（生活防衛資金を含む） */
  cash: number;
  /** 現在の投資資産（株式・投資信託など） */
  investments: number;
  /** 預金金利（％/年） */
  cashRate: number;
  /** 投資資産の想定利回り（％/年） */
  investmentRate: number;
  /** 毎月の積立投資額（現金から投資へ振り替える額） */
  monthlyInvestment: number;
  /** 昇給率（％/年） */
  raiseRate: number;
  retireAge: number;
  /** 退職金の見込み額 */
  retirementPay: number;
  /** 年金の月額見込み（世帯合計） */
  pensionMonthly: number;
}

export type IncomePerson = 'self' | 'spouse';

/**
 * 収入の区分。
 * - salary: 給与（税・社会保険料を差し引いて手取りを計算する）
 * - benefit: 育児休業給付金など非課税の給付（額面がそのまま手取りになり、昇給もしない）
 */
export type IncomeKind = 'salary' | 'benefit';

/** 転職・育休・退職など、収入が変わるタイミング */
export interface IncomeEvent {
  id: string;
  person: IncomePerson;
  /** 何年後から適用するか */
  yearsLater: number;
  /** 変更後の額面年収（0 なら収入なし） */
  newIncome: number;
  kind: IncomeKind;
  /** 「転職」「育休」など、グラフや表に表示するラベル */
  label: string;
}

/** 子ども 1 人あたりの養育費（年額・万円）。教育費は別に計算する */
export interface CareCostTable {
  /** 0〜2歳 */
  infant: number;
  /** 3〜5歳 */
  preschool: number;
  /** 6〜11歳 */
  elementary: number;
  /** 12〜14歳 */
  juniorHigh: number;
  /** 15〜17歳 */
  highSchool: number;
  /** 18〜21歳 */
  university: number;
}

/** 学齢ごとの教育費（年額・万円）。通学費・制服・給食費・塾代を含む学習費ベース */
export interface EducationCostTable {
  /** 幼稚園・保育園（3〜5歳） */
  kindergarten: number;
  /** 小学校（6〜11歳） */
  elementary: number;
  /** 中学校（12〜14歳） */
  juniorHigh: number;
  /** 高校（15〜17歳） */
  highSchool: number;
  /** 大学（18〜21歳） */
  university: number;
  /** 大学院（22歳以降） */
  graduate: number;
}

export interface EducationCosts {
  public: EducationCostTable;
  private: EducationCostTable;
}

export interface ChildrenAnswer {
  /** これから生まれる子の誕生時期（何年後か）。要素数がそのまま人数になる */
  births: number[];
  /** 進学段階ごとの公立・私立（既存の子どもにも適用する） */
  path: EducationPath;
  /** 最終学歴 */
  finalStage: FinalStage;
  /** 子ども 1 人あたりの養育費。世帯人数が増えることによる食費・光熱費の増加も含む */
  careCosts: CareCostTable;
  /** 学齢ごとの教育費。教育方針に応じて公立・私立のどちらかが使われる */
  educationCosts: EducationCosts;
  /** 大学院に在籍する年数（修士 2 年、博士まで進むなら 5 年など） */
  graduateYears: number;
}

export interface HousingAnswer {
  planned: boolean;
  yearsLater: number;
  /** 物件価格 */
  price: number;
  /** 頭金 */
  downPayment: number;
  /** 返済期間（年） */
  loanYears: number;
  /** 借入金利（％/年） */
  loanRate: number;
  /** 頭金・諸費用をどこから払うか */
  fundedBy: FundingSource;
}

/** 大きな支出をどこから払うか */
export type FundingSource = 'cash' | 'investment';

/** 結婚式・車の購入・住宅リフォームなど、単発または周期的なまとまった支出 */
export interface BigExpense {
  id: string;
  /** 何年後に発生するか */
  yearsLater: number;
  /** 1 回あたりの金額 */
  amount: number;
  label: string;
  /** 繰り返しの間隔（年）。0 なら 1 回だけ */
  repeatYears: number;
  /** 繰り返しを何歳まで続けるか。0 なら期限なし */
  untilAge: number;
  /** 支払いの原資 */
  fundedBy: FundingSource;
}

/** 毎月の積立額の変更 */
export interface InvestmentChange {
  id: string;
  /** 何年後から適用するか */
  yearsLater: number;
  /** 変更後の毎月の積立額 */
  monthlyAmount: number;
  label: string;
}

/** 引越し（複数回の予定を登録できる） */
export interface MoveEvent {
  id: string;
  /** 何年後に引越すか */
  yearsLater: number;
  /** 引越し後の家賃（月額） */
  monthlyRent: number;
  /** 敷金礼金・引越し代として計上する家賃の月数 */
  initialCostMonths: number;
  label: string;
}



/**
 * 老後の投資資産の取り崩し方。
 * - asNeeded: 生活費が足りない年だけ必要な分を売る
 * - fixedAmount: 毎年決まった額を取り崩す
 * - fixedRate: 毎年、残高に対する決まった割合を取り崩す（4%ルールなど）
 * - cashOut: 取り崩し開始の年に全額を現金化する
 */
export type WithdrawalStrategy = 'asNeeded' | 'fixedAmount' | 'fixedRate' | 'cashOut';

export interface RetirementAnswer {
  strategy: WithdrawalStrategy;
  /** 積立をやめる年齢 */
  contributionEndAge: number;
  /** 取り崩しを始める年齢 */
  withdrawalStartAge: number;
  /** fixedAmount のときの年間取り崩し額 */
  fixedAmount: number;
  /** fixedRate のときの取り崩し率（％/年） */
  fixedRate: number;
  /** 取り崩し開始後の想定利回り（％/年）。リスクを下げる前提なら低めに設定する */
  postReturnRate: number;
}

export interface PlanAnswers {
  /** 収入の変化（本人・配偶者とも、発生年の早い順に適用される） */
  incomeEvents: IncomeEvent[];
  /** 結婚式・車の購入・リフォームなどの大型出費 */
  bigExpenses: BigExpense[];
  /** 毎月の積立額の変更（何回でも登録できる） */
  investmentChanges: InvestmentChange[];
  /** 老後の資産の取り崩し方 */
  retirement: RetirementAnswer;
  children: ChildrenAnswer;
  housing: HousingAnswer;
  /** 引越しの予定（何回でも登録できる） */
  moves: MoveEvent[];
}

export interface YearRow {
  /** 経過年数（0 = 今年） */
  t: number;
  year: number;
  age: number;
  /** 世帯の手取り収入（年額） */
  income: number;
  /** 内訳：給与などの手取り */
  workIncome: number;
  /** 内訳：育休給付金など非課税の給付 */
  benefitIncome: number;
  /** 本人の額面年収 */
  selfGross: number;
  /** 配偶者の額面年収 */
  spouseGross: number;
  /** 内訳：年金の手取り */
  pensionIncome: number;
  /** 内訳：児童手当 */
  allowance: number;
  /** 内訳：退職金など一時収入 */
  lumpIncome: number;
  /** 支出合計（年額） */
  expense: number;
  living: number;
  housing: number;
  education: number;
  /** 住宅購入の頭金・引越し初期費用などの一時支出 */
  lumpExpense: number;
  /** 結婚式・車の購入などの大型出費 */
  bigExpense: number;
  /** 年間収支（収入計 − 支出計） */
  balance: number;
  /** 投資へ回した積立額 */
  contribution: number;
  /** 大きな支出を投資から払うために取り崩した額 */
  expenseWithdrawal: number;
  /** 出口戦略にもとづいて計画的に取り崩した投資資産 */
  plannedWithdrawal: number;
  /** 現金が不足したため追加で取り崩した投資資産 */
  withdrawal: number;
  /** 預金利息 */
  cashInterest: number;
  /** 投資資産の運用益 */
  investmentGain: number;
  /** 年末時点の現金・預金 */
  cash: number;
  /** 年末時点の投資資産 */
  investments: number;
  /** 年末時点の総資産（現金＋投資） */
  totalAssets: number;
  /** 同居している子どもの人数 */
  childCount: number;
  events: string[];
}

export type AdviceLevel = 'good' | 'warning' | 'critical' | 'info';

export interface Advice {
  level: AdviceLevel;
  title: string;
  body: string;
}

export interface SimulationResult {
  rows: YearRow[];
  /** 総資産が底をついた最初の行（なければ null） */
  depletion: YearRow | null;
  /** 期間中の最低残高の行 */
  minRow: YearRow;
  /** 期間中の最高残高の行 */
  maxRow: YearRow;
  /** 退職時点の残高 */
  atRetirement: YearRow | null;
  /** 最終年の残高 */
  final: YearRow;
  /** 住宅ローンの年間返済額（購入する場合） */
  annualLoanPayment: number;
}
