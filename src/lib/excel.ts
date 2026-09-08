import type { Workbook, Worksheet } from 'exceljs';
import { buildAdvice } from './advice';
import { saveFile, type SaveResult } from './download';
import {
  defaultAnswers,
  defaultCareCosts,
  defaultEducationCosts,
  defaultEducationPath,
} from './defaults';
import { calcColumns, childPlans, colLetter } from './excelLayout';
import { normalizeIncomeEvents, simulate } from './simulate';
import type { BasicInfo, PlanAnswers } from './types';

const FONT = { name: 'Meiryo UI', size: 10 } as const;
const HOME_TYPE_LABEL: Record<string, string> = {
  family: '実家',
  rent: '賃貸',
  owned: '持ち家',
};
const INPUT_COLOR = 'FF0000FF';
const LINK_COLOR = 'FF008000';
const HEAD_FILL = 'FF1F4E78';
const INPUT_FILL = 'FFFFF2CC';
const MONEY = '#,##0';
const RATE = '0.00%';

/** INPUT シートを組み立てながら、書いたセルのアドレスを名前で覚えておく */
class InputSheet {
  readonly ws: Worksheet;
  private row = 1;
  readonly ref: Record<string, string> = {};

  constructor(ws: Worksheet) {
    this.ws = ws;
  }

  get currentRow(): number {
    return this.row;
  }

  skip(n = 1): void {
    this.row += n;
  }

  title(text: string, note?: string): void {
    const c = this.ws.getCell(`B${this.row}`);
    c.value = text;
    c.font = { ...FONT, size: 14, bold: true, color: { argb: HEAD_FILL } };
    this.row += 1;
    if (note) {
      const n = this.ws.getCell(`B${this.row}`);
      n.value = note;
      n.font = { ...FONT, size: 9, color: { argb: 'FF666666' } };
      this.row += 1;
    }
    this.row += 1;
  }

  section(text: string): void {
    for (let col = 2; col <= 6; col += 1) {
      const c = this.ws.getCell(this.row, col);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
      c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      if (col === 2) c.value = text;
    }
    this.row += 1;
  }

  note(text: string): void {
    const c = this.ws.getCell(`B${this.row}`);
    c.value = text;
    c.font = { ...FONT, size: 9, color: { argb: 'FF666666' } };
    this.row += 1;
  }

  /** 入力セル（青字・黄背景）を 1 行書き、そのアドレスを返す */
  input(
    key: string,
    label: string,
    value: string | number,
    opts: { note?: string; fmt?: string; list?: string[] } = {},
  ): string {
    const r = this.row;
    const l = this.ws.getCell(`B${r}`);
    l.value = label;
    l.font = FONT;
    const c = this.ws.getCell(`C${r}`);
    c.value = value;
    c.font = { ...FONT, color: { argb: INPUT_COLOR }, bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
    c.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    if (opts.fmt) c.numFmt = opts.fmt;
    if (opts.list) {
      c.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${opts.list.join(',')}"`],
      };
    }
    if (opts.note) {
      const n = this.ws.getCell(`D${r}`);
      n.value = opts.note;
      n.font = { ...FONT, size: 9, color: { argb: 'FF666666' } };
    }
    this.row += 1;
    this.ref[key] = `INPUT!$C$${r}`;
    return `INPUT!$C$${r}`;
  }

  /** 自動計算セル（黒字）を 1 行書く */
  formula(key: string, label: string, formula: string, note?: string, fmt = MONEY): string {
    const r = this.row;
    const l = this.ws.getCell(`B${r}`);
    l.value = label;
    l.font = FONT;
    const c = this.ws.getCell(`C${r}`);
    c.value = { formula, date1904: false };
    c.font = FONT;
    c.numFmt = fmt;
    if (note) {
      const n = this.ws.getCell(`D${r}`);
      n.value = note;
      n.font = { ...FONT, size: 9, color: { argb: 'FF666666' } };
    }
    this.row += 1;
    this.ref[key] = `INPUT!$C$${r}`;
    return this.ref[key];
  }

  /** 表のヘッダー行を書く */
  tableHeader(labels: string[], startCol = 2): void {
    labels.forEach((t, i) => {
      const c = this.ws.getCell(this.row, startCol + i);
      c.value = t;
      c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      c.alignment = { horizontal: 'center', wrapText: true };
    });
    this.row += 1;
  }

  /** 表の 1 行を書く。value が {f: 数式} なら数式セルになる */
  tableRow(
    values: (string | number | { f: string } | null)[],
    opts: { startCol?: number; inputCols?: number[]; fmts?: (string | undefined)[] } = {},
  ): number {
    const r = this.row;
    const startCol = opts.startCol ?? 2;
    values.forEach((v, i) => {
      const c = this.ws.getCell(r, startCol + i);
      // 空欄は空文字列ではなく未設定にする。数式が空文字列を数値として扱えないため
      if (v === null) {
        if ((opts.inputCols ?? []).includes(i)) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
          c.font = { ...FONT, color: { argb: INPUT_COLOR }, bold: true };
        }
      } else if (typeof v === 'object') {
        c.value = { formula: v.f, date1904: false };
        c.font = FONT;
      } else {
        c.value = v;
        const isInput = (opts.inputCols ?? []).includes(i);
        c.font = isInput ? { ...FONT, color: { argb: INPUT_COLOR }, bold: true } : FONT;
        if (isInput) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
        }
      }
      c.border = {
        top: { style: 'hair' },
        left: { style: 'hair' },
        bottom: { style: 'hair' },
        right: { style: 'hair' },
      };
      const fmt = opts.fmts?.[i];
      if (fmt) c.numFmt = fmt;
    });
    this.row += 1;
    return r;
  }
}

export interface WorkbookInput {
  info: BasicInfo;
  answers: PlanAnswers;
}

/** ライフプランのワークブックを組み立てる（数式は INPUT シートを参照して再計算される） */
export async function buildLifePlanWorkbook({ info, answers }: WorkbookInput): Promise<Workbook> {
  // CDN から読み込まれていればそれを使い、なければバンドルされたものを読み込む
  type ExcelJSModule = typeof import('exceljs');
  const fromCdn = (globalThis as { ExcelJS?: ExcelJSModule }).ExcelJS;
  const mod = fromCdn ?? (await import('exceljs'));
  const ExcelJS = ((mod as { default?: ExcelJSModule }).default ?? mod) as ExcelJSModule;

  const result = simulate(info, answers);
  const advice = buildAdvice(info, answers, result);
  const startYear = result.rows[0].year;
  const years = result.rows.length;
  const children = childPlans(info, answers, startYear);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LifePlanSim';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const intro = wb.addWorksheet('はじめに');
  const inputWs = wb.addWorksheet('INPUT');
  const calcWs = wb.addWorksheet('計算');
  const outWs = wb.addWorksheet('結果');

  // ============================== INPUT ==============================
  inputWs.getColumn(1).width = 2;
  inputWs.getColumn(2).width = 26;
  inputWs.getColumn(3).width = 14;
  inputWs.getColumn(4).width = 34;
  inputWs.getColumn(5).width = 14;
  inputWs.getColumn(6).width = 14;
  inputWs.getColumn(7).width = 14;
  inputWs.getColumn(8).width = 14;

  const I = new InputSheet(inputWs);
  I.skip(1);
  I.title(
    'INPUT シート（黄色いセルに入力してください）',
    '金額の単位はすべて「万円」です。ここを書き換えると「計算」「結果」シートが自動で計算し直されます。',
  );

  I.section('■ 基本設定');
  I.input('startYear', 'シミュレーション開始年', startYear, { note: '西暦' });
  I.input('years', '計算年数', years, { note: `${startYear}〜${startYear + years - 1}年（95歳まで）` });
  I.skip();

  I.section('■ 家族・収入');
  I.input('age', '本人の年齢', info.age, { note: '開始年時点の年齢' });
  I.input('hasSpouse', '配偶者', info.hasSpouse ? '有' : '無', { list: ['有', '無'] });
  I.input('spouseAge', '配偶者の年齢', info.spouseAge);
  I.input('income', '本人の年収（額面）', info.income, { fmt: MONEY });
  I.input('spouseIncome', '配偶者の年収（額面）', info.spouseIncome, { fmt: MONEY });
  I.input('raise', '昇給率', info.raiseRate / 100, { fmt: RATE, note: '毎年この率で年収が増える前提' });
  I.input('inflation', '物価上昇率', (info.inflationRate ?? 0) / 100, {
    fmt: RATE,
    note: '生活費・教育費・家賃・大型出費に反映します（年金・退職金・ローン返済額は据え置き）',
  });
  I.input('retireAge', '退職年齢', info.retireAge);
  I.input('retirementPay', '退職金', info.retirementPay, { fmt: MONEY });
  I.input('pensionAge', '年金の受給開始年齢', 65);
  I.input('pensionMonthly', '年金の月額（世帯合計）', info.pensionMonthly, { fmt: MONEY });
  I.input('macroSlide', '年金のマクロ経済スライド調整率', 0.009, {
    fmt: RATE,
    note: '年金額は物価上昇率からこの分を引いた率で増えます',
  });
  I.input('pensionNetLow', '年金手取り率（180万円以下）', 0.94, { fmt: RATE });
  I.input('pensionNetHigh', '年金手取り率（180万円超）', 0.88, { fmt: RATE });
  I.skip();

  I.section('■ 収入の変化（転職・育休・専業主婦(夫)・再就職など）');
  I.note(
    '※ 対象と発生年、変更後の年収を入れると、その年から収入が切り替わります（空行は無視されます）。',
  );
  I.note(
    '※ 区分を「給付金」にすると、育児休業給付金のように非課税・社会保険料免除として扱い、手取り＝額面で計算します。',
  );
  I.tableHeader(['対象', '発生年', '変更後の年収（万円）', '区分', 'メモ']);
  const eventStart = I.currentRow;
  const sortedEvents = normalizeIncomeEvents(answers.incomeEvents);
  sortedEvents.forEach((e) => {
    I.tableRow(
      [
        e.person === 'self' ? '本人' : '配偶者',
        startYear + e.yearsLater,
        e.newIncome,
        e.kind === 'benefit' ? '給付金' : '給与',
        e.label,
      ],
      { inputCols: [0, 1, 2, 3, 4], fmts: [undefined, '0', MONEY] },
    );
  });
  for (let i = 0; i < 3; i += 1) {
    I.tableRow([null, null, null, null, null], {
      inputCols: [0, 1, 2, 3, 4],
      fmts: [undefined, '0', MONEY],
    });
  }
  const eventEnd = I.currentRow - 1;
  I.skip();

  I.section('■ お子さん');
  I.note('※ 生年を入れると、各年の年齢・教育費・児童手当・養育費が自動計算されます。');
  I.tableHeader(['対象', '生年（西暦）', '区分']);
  const childRows: number[] = [];
  children.forEach((c) => {
    const r = I.tableRow(
      [c.label, c.birthYear, c.existing ? '現在いる子' : 'これから生まれる子'],
      { inputCols: [1] },
    );
    childRows.push(r);
  });
  I.skip();

  I.section('■ 生活費・養育費');
  I.input('livingMonthly', '大人の生活費（月額）', info.livingCost, {
    fmt: MONEY,
    note: '本人と配偶者の分。住居費・教育費・子どもの養育費は含みません',
  });
  I.input('retiredRatio', '退職後の生活費の比率', 0.85, { fmt: RATE });
  I.note('※ 養育費は子ども1人あたりの年額です（教育費は別に計算します）。');
  I.note(
    '※ 既定値は内閣府の子育て費用調査から教育関連を除き、物価上昇を加味した目安です（0〜21歳で約1,870万円）。仕送りをする場合は18〜21歳を増やしてください。',
  );
  const care = answers.children.careCosts ?? defaultCareCosts;
  I.input('careInfant', '養育費（0〜2歳）', care.infant, {
    fmt: MONEY,
    note: '食費・衣類・医療費・小遣い・レジャー費に加え、世帯人数が増える分の光熱費なども含みます',
  });
  I.input('carePreschool', '養育費（3〜5歳）', care.preschool, { fmt: MONEY });
  I.input('careElementary', '養育費（6〜11歳）', care.elementary, { fmt: MONEY });
  I.input('careJuniorHigh', '養育費（12〜14歳）', care.juniorHigh, { fmt: MONEY });
  I.input('careHighSchool', '養育費（15〜17歳）', care.highSchool, { fmt: MONEY });
  I.input('careUniversity', '養育費（18〜21歳）', care.university, { fmt: MONEY });
  I.skip();

  I.section('■ 住居');
  I.input('homeType', '現在の住まい', HOME_TYPE_LABEL[info.homeType ?? 'rent'], {
    list: ['実家', '賃貸', '持ち家'],
    note: '計算には影響しません（下の金額の意味を示すためのラベルです）',
  });
  I.input('rent', '現在の住居費（月額）', info.rent, {
    fmt: MONEY,
    note: '実家なら家に入れている金額、持ち家ならローン返済額（維持費は下の欄）',
  });
  I.input('loanRemainingYears', 'ローンの残り返済年数', info.loanRemainingYears ?? 0, {
    note: '「持ち家」のときに使います（0 なら完済済み）',
  });
  I.input('homeUpkeepMonthly', '持ち家の維持費（月額）', info.homeUpkeepMonthly ?? 0, {
    fmt: MONEY,
    note: '固定資産税・修繕積立金・管理費・保険。完済後も続きます',
  });
  I.note('※ 引越しは複数回登録できます。発生年の新しいものが、その年以降の家賃になります。');
  I.tableHeader(['発生年', '引越し後の家賃（万円/月）', '初期費用（家賃の何か月分）', 'メモ']);
  const moveStart = I.currentRow;
  const sortedMoves = (answers.moves ?? [])
    .slice()
    .sort((a, b) => a.yearsLater - b.yearsLater);
  sortedMoves.forEach((m) => {
    I.tableRow([startYear + m.yearsLater, m.monthlyRent, m.initialCostMonths, m.label], {
      inputCols: [0, 1, 2, 3],
      fmts: ['0', MONEY, '0'],
    });
  });
  for (let i = 0; i < 3; i += 1) {
    I.tableRow([null, null, null, null], {
      inputCols: [0, 1, 2, 3],
      fmts: ['0', MONEY, '0'],
    });
  }
  const moveEnd = I.currentRow - 1;
  I.input('buying', '住宅購入の予定', answers.housing.planned ? '有' : '無', { list: ['有', '無'] });
  I.input('buyYear', '購入する年', startYear + answers.housing.yearsLater);
  I.input('price', '物件価格', answers.housing.price, {
    fmt: MONEY,
    note: 'いまの相場で入力してください（購入年までの物価上昇を反映します）',
  });
  I.input('downPayment', '頭金', answers.housing.downPayment, { fmt: MONEY });
  I.input('loanRate', '借入金利', answers.housing.loanRate / 100, { fmt: RATE });
  I.input('loanYears', '返済期間', answers.housing.loanYears, { note: '年' });
  I.input('feeRate', '購入時の諸費用率', 0.07, { fmt: RATE, note: '仲介手数料・登記・税金など' });
  I.input('upkeepRate', '持ち家の年間維持費率', 0.01, { fmt: RATE, note: '固定資産税・修繕積立・保険' });
  I.input(
    'housingFunding',
    '頭金・諸費用の支払い元',
    (answers.housing.fundedBy ?? 'cash') === 'investment' ? '投資' : '現金',
    { list: ['現金', '投資'], note: '「投資」を選ぶとその年に投資資産を取り崩します' },
  );
  I.formula(
    'loanPrincipal',
    '借入額（自動計算）',
    `(${I.ref.price}-${I.ref.downPayment})*(1+${I.ref.inflation})^(${I.ref.buyYear}-${I.ref.startYear})`,
    '物件価格・頭金は「いまの相場」として、購入年までの物価上昇を反映します',
  );
  I.formula(
    'loanMonthly',
    '月返済額（自動計算）',
    `IF(${I.ref.loanPrincipal}<=0,0,PMT(${I.ref.loanRate}/12,${I.ref.loanYears}*12,-${I.ref.loanPrincipal}))`,
    '元利均等返済（PMT 関数）',
    '#,##0.00',
  );
  I.formula('loanAnnual', '年間返済額（自動計算）', `${I.ref.loanMonthly}*12`);
  I.input('taxCredit', '住宅ローン控除', (answers.housing.taxCredit ?? true) ? '有' : '無', {
    list: ['有', '無'],
    note: '年末残高×控除率が所得税・住民税から戻ります',
  });
  I.input('creditYears', '控除期間', answers.housing.creditYears ?? 13, {
    note: '年。新築は13年、中古は10年が目安',
  });
  I.input('creditRate', '控除率', (answers.housing.creditRate ?? 0.7) / 100, { fmt: RATE });
  I.input('creditLimit', '控除対象の残高上限', answers.housing.creditLimit ?? 3000, {
    fmt: MONEY,
    note: '住宅の省エネ性能により2,000〜5,000万円',
  });
  I.skip();

  I.section('■ 大型出費');
  I.note(
    '※ 結婚式・車の購入・リフォームなど、まとまった支出を入力してください（空行は無視されます）。',
  );
  I.note('※ 「繰り返し」に年数を入れると、その間隔で繰り返し発生します（0 なら 1 回だけ）。');
  I.note('※ 「◯歳まで」は繰り返す出費の上限です（0 なら期限なし）。支払い元に「投資」を選ぶと投資資産を取り崩します。');
  I.tableHeader(['発生年', '内容', '金額（万円）', '繰り返し（年）', '◯歳まで', '支払い元']);
  const bigStart = I.currentRow;
  const sortedExpenses = answers.bigExpenses
    .slice()
    .sort((a, b) => a.yearsLater - b.yearsLater);
  sortedExpenses.forEach((e) => {
    I.tableRow(
      [
        startYear + e.yearsLater,
        e.label,
        e.amount,
        e.repeatYears,
        e.untilAge ?? 0,
        (e.fundedBy ?? 'cash') === 'investment' ? '投資' : '現金',
      ],
      { inputCols: [0, 1, 2, 3, 4, 5], fmts: ['0', undefined, MONEY, '0', '0'] },
    );
  });
  for (let i = 0; i < 3; i += 1) {
    I.tableRow([null, null, null, null, null, null], {
      inputCols: [0, 1, 2, 3, 4, 5],
      fmts: ['0', undefined, MONEY, '0', '0'],
    });
  }
  const bigEnd = I.currentRow - 1;
  I.skip();

  I.section('■ 教育費');
  I.note('※ 進学段階ごとに「公立」「私立」を選ぶと、下の「適用される教育費」が自動で切り替わります。');
  I.note(
    '※ 学習費調査ベースの金額で、授業料・通学費・制服・給食費・塾や習い事の費用を含みます（公立と私立の差はこの表で表現しているため、養育費は方針によらず同額です）。',
  );
  const eduPath = answers.children.path ?? defaultEducationPath;
  const finalStage = answers.children.finalStage ?? 'university';
  const FINAL_LABEL: Record<string, string> = {
    highSchool: '高校卒',
    university: '大学卒',
    graduate: '大学院卒',
  };
  const stageInputs: [string, string, keyof typeof eduPath][] = [
    ['eduKindergarten', '幼稚園（3〜5歳）', 'kindergarten'],
    ['eduElementary', '小学校（6〜11歳）', 'elementary'],
    ['eduJuniorHigh', '中学校（12〜14歳）', 'juniorHigh'],
    ['eduHighSchool', '高校（15〜17歳）', 'highSchool'],
    ['eduUniversity', '大学（18〜21歳）', 'university'],
    ['eduGraduate', '大学院（22歳〜）', 'graduate'],
  ];
  stageInputs.forEach(([key, label, stage]) => {
    I.input(key, label, eduPath[stage] === 'private' ? '私立' : '公立', {
      list: ['公立', '私立'],
    });
  });
  I.input('finalStage', '最終学歴', FINAL_LABEL[finalStage] ?? '大学卒', {
    list: ['高校卒', '大学卒', '大学院卒'],
  });
  I.input('graduateYears', '大学院の年数', answers.children.graduateYears ?? 2, {
    note: '修士なら2年、博士まで進むなら5年',
  });
  I.formula(
    'supportEndAge',
    '教育費・養育費の上限年齢',
    `IF(${I.ref.finalStage}="高校卒",17,IF(${I.ref.finalStage}="大学卒",21,21+${I.ref.graduateYears}))`,
    '最終学歴から自動計算。この年齢を過ぎると教育費も養育費も計上しません',
    '0',
  );
  I.skip();

  I.tableHeader([
    '区分',
    '幼稚園(3-5)',
    '小学校(6-11)',
    '中学校(12-14)',
    '高校(15-17)',
    '大学(18-21)',
    '大学院(22歳〜)',
  ]);
  const edu = answers.children.educationCosts ?? defaultEducationCosts;
  const pubRow = I.tableRow(
    [
      '公立（年額）',
      edu.public.kindergarten,
      edu.public.elementary,
      edu.public.juniorHigh,
      edu.public.highSchool,
      edu.public.university,
      edu.public.graduate,
    ],
    { inputCols: [1, 2, 3, 4, 5, 6], fmts: [undefined, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY] },
  );
  const privRow = I.tableRow(
    [
      '私立（年額）',
      edu.private.kindergarten,
      edu.private.elementary,
      edu.private.juniorHigh,
      edu.private.highSchool,
      edu.private.university,
      edu.private.graduate,
    ],
    { inputCols: [1, 2, 3, 4, 5, 6], fmts: [undefined, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY] },
  );
  const pick = (ref: string, col: string) =>
    `IF(${ref}="私立",${col}${privRow},${col}${pubRow})`;
  const applyRow = I.tableRow(
    [
      '適用される教育費',
      { f: pick(I.ref.eduKindergarten, 'C') },
      { f: pick(I.ref.eduElementary, 'D') },
      { f: pick(I.ref.eduJuniorHigh, 'E') },
      { f: pick(I.ref.eduHighSchool, 'F') },
      { f: pick(I.ref.eduUniversity, 'G') },
      { f: pick(I.ref.eduGraduate, 'H') },
    ],
    { fmts: [undefined, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY] },
  );
  I.skip();
  I.tableHeader(['入学時の一時費用', '中学校(12歳)', '高校(15歳)', '大学(18歳)', '大学院(22歳)']);
  const entryRow = I.tableRow(
    [
      '適用される入学金',
      { f: `IF(${I.ref.eduJuniorHigh}="私立",20,0)` },
      { f: `IF(${I.ref.eduHighSchool}="私立",15,0)` },
      { f: `IF(${I.ref.eduUniversity}="私立",30,15)` },
      20,
    ],
    { inputCols: [4], fmts: [undefined, MONEY, MONEY, MONEY, MONEY] },
  );
  I.skip();

  I.section('■ 児童手当');
  I.input('allow02', '0〜2歳（月額）', 1.5, { fmt: MONEY });
  I.input('allow318', '3〜18歳（月額）', 1, { fmt: MONEY });
  I.input('allow3rd', '第3子以降（月額）', 3, { fmt: MONEY, note: '18歳まで' });
  I.skip();

  I.section('■ 資産（現金と投資を分けて計算します）');
  I.input('cash', '現金・預金', info.cash, { fmt: MONEY });
  I.input('investments', '投資資産', info.investments, { fmt: MONEY });
  I.input('cashRate', '預金金利', info.cashRate / 100, { fmt: RATE });
  I.input('investRate', '投資の想定利回り', info.investmentRate / 100, { fmt: RATE });
  I.input('idecoMonthly', 'iDeCo・企業型DCの掛金（月額）', info.idecoMonthly ?? 0, {
    fmt: MONEY,
    note: '自分で出す掛金。全額が所得控除になり、60歳まで引き出せません',
  });
  I.input('idecoBalance', 'iDeCo・企業型DCの現在の残高', info.idecoBalance ?? 0, { fmt: MONEY });
  I.input('idecoReleaseAge', 'iDeCo を受け取れる年齢', 60, {
    note: 'この年に投資資産へ合流させます',
  });
  I.input('monthlyInvest', '毎月の積立額', info.monthlyInvestment, {
    fmt: MONEY,
    note: '現金から投資へ振り替える額。余剰が足りない年は自動的に減額されます',
  });
  I.note('※ 途中で積立額を変える場合は、下の表に発生年と変更後の月額を入れてください。');
  I.tableHeader(['発生年', '変更後の積立額（万円/月）', 'メモ']);
  const investStart = I.currentRow;
  const sortedInvestChanges = (answers.investmentChanges ?? [])
    .slice()
    .sort((a, b) => a.yearsLater - b.yearsLater);
  sortedInvestChanges.forEach((c) => {
    I.tableRow([startYear + c.yearsLater, c.monthlyAmount, c.label], {
      inputCols: [0, 1, 2],
      fmts: ['0', MONEY],
    });
  });
  for (let i = 0; i < 3; i += 1) {
    I.tableRow([null, null, null], { inputCols: [0, 1, 2], fmts: ['0', MONEY] });
  }
  const investEnd = I.currentRow - 1;
  I.skip();

  I.section('■ 老後の取り崩し（出口戦略）');
  I.note('※ 取り崩し方法を変えると、下の「計算」シートの取り崩し方が切り替わります。');
  const ret = answers.retirement ?? defaultAnswers.retirement;
  const STRATEGY_LABEL: Record<string, string> = {
    asNeeded: '必要な分だけ',
    fixedAmount: '毎年決まった額',
    fixedRate: '毎年決まった率',
    cashOut: '全額を現金化',
  };
  I.input('strategy', '取り崩し方法', STRATEGY_LABEL[ret.strategy] ?? '必要な分だけ', {
    list: ['必要な分だけ', '毎年決まった額', '毎年決まった率', '全額を現金化'],
  });
  I.input('contributionEndAge', '積立をやめる年齢', ret.contributionEndAge, { note: '歳' });
  I.input('withdrawalStartAge', '取り崩しを始める年齢', ret.withdrawalStartAge, { note: '歳' });
  I.input('fixedAmount', '毎年の取り崩し額', ret.fixedAmount, {
    fmt: MONEY,
    note: '「毎年決まった額」を選んだときに使います',
  });
  I.input('fixedRate', '毎年の取り崩し率', ret.fixedRate / 100, {
    fmt: RATE,
    note: '「毎年決まった率」を選んだときに使います（4%ルールなど）',
  });
  I.input('postReturnRate', '取り崩し開始後の利回り', ret.postReturnRate / 100, {
    fmt: RATE,
    note: '債券などへ移してリスクを下げる前提なら低めに設定します',
  });
  I.skip();

  I.section('■ 税・社会保険の前提');
  I.input('insRate', '社会保険料率', 0.147, { fmt: RATE, note: '健康保険・厚生年金・雇用保険の本人負担' });
  I.input('insThreshold', '社会保険の加入下限（年収）', 106, {
    fmt: MONEY,
    note: 'これ未満の年収は社会保険料をかけません（いわゆる106万円の壁）',
  });
  I.input('insCap', '社会保険料の上限となる年収', 1000, { fmt: MONEY });
  I.input('insOverRate', '上限を超えた分の料率', 0.02, { fmt: RATE });
  I.input('basicDeductionTax', '基礎控除（所得税）', 58, {
    fmt: MONEY,
    note: '令和7年度税制改正後の恒久分',
  });
  I.input('basicDeductionRes', '基礎控除（住民税）', 43, { fmt: MONEY });
  I.input('residentRate', '住民税率', 0.1, { fmt: RATE });
  I.input('residentFlat', '住民税の均等割', 0.6, {
    fmt: MONEY,
    note: '市町村3,500円＋道府県1,500円＋森林環境税1,000円',
  });
  I.input('reconstructionRate', '復興特別所得税の係数', 1.021, { fmt: '0.000' });
  I.skip();

  I.note('■ 給与所得控除の速算表（控除額 ＝ 年収 × 係数 ＋ 定数）');
  I.tableHeader(['年収の下限', '係数', '定数']);
  const dedStart = I.currentRow;
  const dedTable: [number, number, number][] = [
    [0, 0, 65],
    [162.5, 0.4, -10],
    [180, 0.3, 8],
    [360, 0.2, 44],
    [660, 0.1, 110],
    [850, 0, 195],
  ];
  dedTable.forEach((t) => I.tableRow([t[0], t[1], t[2]], { inputCols: [0, 1, 2] }));
  const dedEnd = I.currentRow - 1;
  I.skip();

  I.note('■ 所得税の速算表（税額 ＝ 課税所得 × 税率 − 控除額）');
  I.tableHeader(['課税所得の下限', '税率', '控除額']);
  const taxStart = I.currentRow;
  const taxTable: [number, number, number][] = [
    [0, 0.05, 0],
    [195, 0.1, 9.75],
    [330, 0.2, 42.75],
    [695, 0.23, 63.6],
    [900, 0.33, 153.6],
    [1800, 0.4, 279.6],
    [4000, 0.45, 479.6],
  ];
  taxTable.forEach((t) => I.tableRow([t[0], t[1], t[2]], { inputCols: [0, 1, 2], fmts: [MONEY, RATE, MONEY] }));
  const taxEnd = I.currentRow - 1;

  const R = I.ref;

  const bigYear = `INPUT!$B$${bigStart}:$B$${bigEnd}`;
  const bigAmount = `INPUT!$D$${bigStart}:$D$${bigEnd}`;
  const bigRepeat = `INPUT!$E$${bigStart}:$E$${bigEnd}`;
  const bigUntil = `INPUT!$F$${bigStart}:$F$${bigEnd}`;
  const bigFunding = `INPUT!$G$${bigStart}:$G$${bigEnd}`;
  const investYearRange = `INPUT!$B$${investStart}:$B$${investEnd}`;
  const investAmountRange = `INPUT!$C$${investStart}:$C$${investEnd}`;
  const moveYearRange = `INPUT!$B$${moveStart}:$B$${moveEnd}`;
  const moveRentRange = `INPUT!$C$${moveStart}:$C$${moveEnd}`;
  const moveMonthsRange = `INPUT!$D$${moveStart}:$D$${moveEnd}`;
  const evPerson = `INPUT!$B$${eventStart}:$B$${eventEnd}`;
  const evYear = `INPUT!$C$${eventStart}:$C$${eventEnd}`;
  const evIncome = `INPUT!$D$${eventStart}:$D$${eventEnd}`;
  const evKind = `INPUT!$E$${eventStart}:$E$${eventEnd}`;
  const dedLo = `INPUT!$B$${dedStart}:$B$${dedEnd}`;
  const dedCoef = `INPUT!$C$${dedStart}:$C$${dedEnd}`;
  const dedConst = `INPUT!$D$${dedStart}:$D$${dedEnd}`;
  const taxLo = `INPUT!$B$${taxStart}:$B$${taxEnd}`;
  const taxRate = `INPUT!$C$${taxStart}:$C$${taxEnd}`;
  const taxSub = `INPUT!$D$${taxStart}:$D$${taxEnd}`;
  const eduApply = (col: string) => `INPUT!$${col}$${applyRow}`;
  const entryApply = (col: string) => `INPUT!$${col}$${entryRow}`;
  const childBirth = (i: number) => `INPUT!$C$${childRows[i]}`;

  // ============================== 計算 ==============================
  const cols = calcColumns(children);
  const idx: Record<string, number> = {};
  cols.forEach((c, i) => {
    idx[c.key] = i + 1;
  });
  const A = (key: string, row: number) => `${colLetter(idx[key])}${row}`;
  const COL = (key: string) => `'計算'!$${colLetter(idx[key])}$${5}:$${colLetter(idx[key])}$${4 + years}`;

  calcWs.getCell('A1').value = '計算シート（数式で自動計算されます。編集しないでください）';
  calcWs.getCell('A1').font = { ...FONT, bold: true, size: 12, color: { argb: HEAD_FILL } };
  calcWs.getCell('A2').value =
    'すべてのセルが INPUT シートを参照する数式です。数式バーで計算根拠を確認できます。単位は万円。';
  calcWs.getCell('A2').font = { ...FONT, size: 9, color: { argb: 'FF666666' } };

  cols.forEach((c, i) => {
    const cell = calcWs.getCell(4, i + 1);
    cell.value = c.header;
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    calcWs.getColumn(i + 1).width = c.width;
  });
  calcWs.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }];

  for (let i = 0; i < years; i += 1) {
    const row = 5 + i;
    const first = i === 0;
    const prevCash = first ? R.cash : A('cash', row - 1);
    const prevInv = first ? R.investments : A('investments', row - 1);
    const y = A('year', row);
    const el = A('elapsed', row);
    const age = A('age', row);

    const put = (key: string, formula: string) => {
      const cell = calcWs.getCell(row, idx[key]);
      cell.value = { formula, date1904: false };
      cell.font = { ...FONT, size: 9 };
      const fmt = cols[idx[key] - 1].fmt;
      if (fmt) cell.numFmt = fmt;
    };

    put('year', first ? `${R.startYear}` : `${A('year', row - 1)}+1`);
    put('elapsed', `${y}-${R.startYear}`);
    put('age', `${R.age}+${el}`);
    put('spouseAge', `IF(${R.hasSpouse}="有",${R.spouseAge}+${el},"")`);
    children.forEach((_, ci) => {
      put(`childAge${ci}`, `IF(${y}<${childBirth(ci)},"",${y}-${childBirth(ci)})`);
    });

    // --- 収入の変化（その年に適用されている直近のイベントを探す） ---
    (
      [
        ['self', '本人'],
        ['spouse', '配偶者'],
      ] as const
    ).forEach(([who, personLabel]) => {
      put(
        `${who}LastYear`,
        `SUMPRODUCT(MAX((${evPerson}="${personLabel}")*(${evYear}<=${y})*${evYear}))`,
      );
      const lastYear = A(`${who}LastYear`, row);
      put(
        `${who}LastIncome`,
        `IF(${lastYear}=0,0,SUMIFS(${evIncome},${evPerson},"${personLabel}",${evYear},${lastYear}))`,
      );
      put(
        `${who}TaxFree`,
        `IF(${lastYear}=0,0,COUNTIFS(${evPerson},"${personLabel}",${evYear},${lastYear},${evKind},"給付金"))`,
      );
    });

    // --- 収入 ---
    const selfLast = A('selfLastYear', row);
    const spouseLast = A('spouseLastYear', row);
    put(
      'selfGross',
      `IF(${age}>=${R.retireAge},0,IF(${selfLast}=0,${R.income}*(1+${R.raise})^${el},IF(${A('selfTaxFree', row)}>0,${A('selfLastIncome', row)},${A('selfLastIncome', row)}*(1+${R.raise})^(${y}-${selfLast}))))`,
    );
    put(
      'spouseGross',
      `IF(OR(${R.hasSpouse}<>"有",${R.spouseAge}+${el}>=${R.retireAge}),0,IF(${spouseLast}=0,${R.spouseIncome}*(1+${R.raise})^${el},IF(${A('spouseTaxFree', row)}>0,${A('spouseLastIncome', row)},${A('spouseLastIncome', row)}*(1+${R.raise})^(${y}-${spouseLast}))))`,
    );

    (
      [
        ['self', 'selfGross'],
        ['spouse', 'spouseGross'],
      ] as const
    ).forEach(([who, grossKey]) => {
      const g = A(grossKey, row);
      const ded = A(`${who}Deduction`, row);
      const ins = A(`${who}Insurance`, row);
      const taxable = A(`${who}Taxable`, row);
      // 給付金（非課税）の年は控除・社会保険料・税をいずれも計上しない
      const taxed = `AND(${g}>0,${A(`${who}TaxFree`, row)}=0)`;
      put(
        `${who}Deduction`,
        `IF(${taxed},MIN(${g},INDEX(${dedCoef},MATCH(${g},${dedLo},1))*${g}+INDEX(${dedConst},MATCH(${g},${dedLo},1))),0)`,
      );
      put(
        `${who}Insurance`,
        `IF(AND(${taxed},${g}>=${R.insThreshold}),MIN(${g},${R.insCap})*${R.insRate}+MAX(0,${g}-${R.insCap})*${R.insOverRate},0)`,
      );
      // iDeCo の掛金は本人の課税所得から差し引く（小規模企業共済等掛金控除）
      const idecoDeduct =
        who === 'self'
          ? `IF(AND(${age}<${R.idecoReleaseAge},${age}<${R.contributionEndAge}),${R.idecoMonthly}*12,0)`
          : '0';
      put(
        `${who}Taxable`,
        `IF(${taxed},MAX(0,${g}-${ded}-${ins}-${idecoDeduct}-${R.basicDeductionTax}),0)`,
      );
      put(
        `${who}IncomeTax`,
        `IF(${taxed},MAX(0,INDEX(${taxRate},MATCH(${taxable},${taxLo},1))*${taxable}-INDEX(${taxSub},MATCH(${taxable},${taxLo},1)))*${R.reconstructionRate},0)`,
      );
      put(
        `${who}ResidentTax`,
        `IF(${taxed},MAX(0,${g}-${ded}-${ins}-${idecoDeduct}-${R.basicDeductionRes})*${R.residentRate}+${R.residentFlat},0)`,
      );
      put(
        `${who}Net`,
        `IF(${g}<=0,0,IF(${A(`${who}TaxFree`, row)}>0,${g},${g}-${ins}-${A(`${who}IncomeTax`, row)}-${A(`${who}ResidentTax`, row)}))`,
      );
    });

    put(
      'pensionGross',
      `IF(${age}>=${R.pensionAge},${R.pensionMonthly}*12*(1+MAX(0,${R.inflation}-${R.macroSlide}))^${el},0)`,
    );
    put(
      'pensionNet',
      `IF(${A('pensionGross', row)}<=0,0,IF(${A('pensionGross', row)}<=180,${A('pensionGross', row)}*${R.pensionNetLow},${A('pensionGross', row)}*${R.pensionNetHigh}))`,
    );
    put(
      'allowance',
      children.length === 0
        ? '0'
        : children
            .map((_, ci) => {
              const a = A(`childAge${ci}`, row);
              // 第3子加算は「21歳以下の子の中で何番目か」で決まるため、
              // 年上の兄姉が22歳になると順位が繰り上がる
              const rankTerms = children
                .map((__, cj) => {
                  if (cj === ci) return null;
                  const aj = A(`childAge${cj}`, row);
                  const cmp = cj < ci ? `${aj}>=${a}` : `${aj}>${a}`;
                  return `IF(AND(ISNUMBER(${aj}),${aj}<=21,${cmp}),1,0)`;
                })
                .filter((t): t is string => t !== null);
              const rank = rankTerms.length > 0 ? `1+${rankTerms.join('+')}` : '1';
              return `IF(ISNUMBER(${a}),IF(${a}<=18,IF((${rank})>=3,${R.allow3rd}*12,IF(${a}<=2,${R.allow02}*12,${R.allow318}*12)),0),0)`;
            })
            .join('+'),
    );
    // 退職金は賃金水準に連動して増える前提
    put('lumpIncome', `IF(${age}=${R.retireAge},${R.retirementPay}*(1+${R.raise})^${el},0)`);

    // 住宅ローン控除：元利均等返済の年末残高に控除率を掛け、納めた税額の範囲で戻る
    const monthlyRate = `${R.loanRate}/12`;
    const totalMonths = `${R.loanYears}*12`;
    const passedMonths = `(${y}-${R.buyYear})*12`;
    put(
      'loanBalance',
      `IF(AND(${R.buying}="有",${y}>=${R.buyYear},${y}<${R.buyYear}+${R.loanYears}),` +
        `${R.loanPrincipal}*((1+${monthlyRate})^(${totalMonths})-(1+${monthlyRate})^(${passedMonths}))/((1+${monthlyRate})^(${totalMonths})-1),0)`,
    );
    // 住民税からの控除は課税所得の5%（上限9.75万円）まで
    const residentTaxable = `MAX(0,${A('selfGross', row)}-${A('selfDeduction', row)}-${A('selfInsurance', row)}-${R.basicDeductionRes})`;
    put(
      'loanTaxCredit',
      `IF(AND(${R.buying}="有",${R.taxCredit}="有",${y}>=${R.buyYear},${y}<${R.buyYear}+${R.creditYears}),` +
        `MAX(0,MIN(MIN(${A('loanBalance', row)},${R.creditLimit})*${R.creditRate},` +
        `${A('selfIncomeTax', row)}+MIN((${residentTaxable})*0.05,9.75))),0)`,
    );

    put(
      'income',
      `${A('selfNet', row)}+${A('spouseNet', row)}+${A('pensionNet', row)}+${A('allowance', row)}+${A('lumpIncome', row)}+${A('loanTaxCredit', row)}`,
    );

    // --- 支出 ---
    // 物価上昇は支出側に反映する（収入は昇給率で別に扱う）
    put('priceLevel', `(1+${R.inflation})^${el}`);
    const price = A('priceLevel', row);

    // 子ども 1 人ずつの養育費（年齢帯で切り替え）
    const careTerm = children
      .map((_, ci) => {
        const a = A(`childAge${ci}`, row);
        // 上限年齢（最終学歴で決まる）を過ぎたら養育費も終わる
        return `IF(AND(ISNUMBER(${a}),${a}<=${R.supportEndAge}),IF(${a}<=2,${R.careInfant},IF(${a}<=5,${R.carePreschool},IF(${a}<=11,${R.careElementary},IF(${a}<=14,${R.careJuniorHigh},IF(${a}<=17,${R.careHighSchool},${R.careUniversity}))))),0)`;
      })
      .join('+');
    put(
      'living',
      `MAX(0,IF(${age}>=${R.retireAge},${R.livingMonthly}*12*${R.retiredRatio},${R.livingMonthly}*12)${careTerm ? `+${careTerm}` : ''})*${price}`,
    );
    put(
      'education',
      children.length === 0
        ? '0'
        : `(${children
            .map((_, ci) => {
              const a = A(`childAge${ci}`, row);
              // 最終学歴から決まる上限年齢を過ぎたら計上しない
              const stage = `IF(${a}<=2,0,IF(${a}<=5,${eduApply('C')},IF(${a}<=11,${eduApply('D')},IF(${a}<=14,${eduApply('E')},IF(${a}<=17,${eduApply('F')},IF(${a}<=21,${eduApply('G')},${eduApply('H')}))))))`;
              const entry = `IF(${a}=12,${entryApply('C')},0)+IF(${a}=15,${entryApply('D')},0)+IF(${a}=18,${entryApply('E')},0)+IF(${a}=22,${entryApply('F')},0)`;
              return `IF(AND(ISNUMBER(${a}),${a}<=${R.supportEndAge}),${stage}+${entry},0)`;
            })
            .join('+')})*${price}`,
    );
    // 引越し：その年までで最後に発生した引越しの家賃を使う
    put('moveYear', `SUMPRODUCT(MAX((${moveYearRange}>0)*(${moveYearRange}<=${y})*${moveYearRange}))`);
    const moveYearCell = A('moveYear', row);
    put(
      'moveRent',
      `IF(${moveYearCell}=0,${R.rent},SUMIFS(${moveRentRange},${moveYearRange},${moveYearCell}))`,
    );
    const owned = `AND(${R.buying}="有",${y}>=${R.buyYear})`;
    // 住居費：購入した持ち家 → 引越し後の賃貸 → いまの住まい（持ち家なら残返済＋維持費）
    const currentHome =
      `IF(${R.homeType}="持ち家",IF(${el}<${R.loanRemainingYears},${R.rent},0)*12+${R.homeUpkeepMonthly}*12*${price},${R.rent}*12*${price})`;
    put(
      'housing',
      `IF(${owned},IF(${y}<=${R.buyYear}+${R.loanYears}-1,${R.loanAnnual},0)+${R.price}*${R.upkeepRate}*${price},` +
        `IF(${A('moveYear', row)}=0,${currentHome},${A('moveRent', row)}*12*${price}))`,
    );
    put(
      'lumpExpense',
      `IF(AND(${R.buying}="有",${y}=${R.buyYear}),(${R.downPayment}+${R.price}*${R.feeRate})*${price},0)+` +
        `IF(${owned},0,SUMPRODUCT((${moveYearRange}=${y})*${moveRentRange}*${moveMonthsRange})*${price})`,
    );
    // 大型出費：1 回だけの支出はその年に、繰り返しの支出は間隔ごとに計上する。
    // 「◯歳まで」を指定した繰り返しは、その年齢を過ぎたら発生させない。
    const bigHit =
      `(${bigYear}>0)*(${bigYear}<=${y})*` +
      `((${bigRepeat}<=0)*(${bigYear}=${y})+` +
      `(${bigRepeat}>0)*(MOD(${y}-${bigYear},${bigRepeat}+(${bigRepeat}<=0))=0)*((${bigUntil}<=0)+(${bigUntil}>0)*(${age}<=${bigUntil})))`;
    put('bigExpense', `SUMPRODUCT(${bigHit}*${bigAmount})*${price}`);
    put(
      'investmentFunded',
      `SUMPRODUCT(${bigHit}*(${bigFunding}="投資")*${bigAmount})*${price}+` +
        `IF(AND(${R.buying}="有",${y}=${R.buyYear},${R.housingFunding}="投資"),(${R.downPayment}+${R.price}*${R.feeRate})*${price},0)`,
    );
    put(
      'expense',
      `${A('living', row)}+${A('education', row)}+${A('housing', row)}+${A('lumpExpense', row)}+${A('bigExpense', row)}`,
    );
    put('balance', `${A('income', row)}-${A('expense', row)}`);

    // --- 資産（現金と投資を分けて計算） ---
    put('cashInterest', `IF(${prevCash}>0,${prevCash}*${R.cashRate},0)`);
    // 取り崩し開始後はリスクを落とした利回りに切り替える
    put(
      'investmentGain',
      `IF(${prevInv}>0,${prevInv}*IF(${age}>=${R.withdrawalStartAge},${R.postReturnRate},${R.investRate}),0)`,
    );
    // iDeCo：60歳まで別に運用し、60歳になったら投資資産へ合流させる
    const prevIdeco = first ? R.idecoBalance : A('ideco', row - 1);
    put(
      'idecoContribution',
      `IF(AND(${age}<${R.idecoReleaseAge},${age}<${R.contributionEndAge}),${R.idecoMonthly}*12,0)`,
    );
    const idecoGrown = `${prevIdeco}*(1+IF(${age}>=${R.withdrawalStartAge},${R.postReturnRate},${R.investRate}))+${A('idecoContribution', row)}`;
    put('ideco', `IF(${age}>=${R.idecoReleaseAge},0,${idecoGrown})`);
    const idecoRelease = `IF(${age}>=${R.idecoReleaseAge},${idecoGrown},0)`;
    const cashBefore = `${prevCash}+${A('cashInterest', row)}+${A('balance', row)}-${A('idecoContribution', row)}`;
    // 積立額：その年までで最後に指定された月額を使う
    put(
      'investChangeYear',
      `SUMPRODUCT(MAX((${investYearRange}>0)*(${investYearRange}<=${y})*${investYearRange}))`,
    );
    const investChangeCell = A('investChangeYear', row);
    put(
      'monthlyInvestment',
      `IF(${investChangeCell}=0,${R.monthlyInvest},SUMIFS(${investAmountRange},${investYearRange},${investChangeCell}))`,
    );
    // 積立は設定した年齢で止める
    put(
      'contribution',
      `IF(${age}<${R.contributionEndAge},MAX(0,MIN(${A('monthlyInvestment', row)}*12,${cashBefore})),0)`,
    );
    const invAfterContrib = `${prevInv}+${A('investmentGain', row)}+${A('contribution', row)}+${idecoRelease}`;
    // 「投資から払う」と指定した支出のぶんを先に取り崩す
    put(
      'expenseWithdrawal',
      `MAX(0,MIN(${invAfterContrib},${A('investmentFunded', row)}))`,
    );
    const invAfterExpense = `${invAfterContrib}-${A('expenseWithdrawal', row)}`;
    // 出口戦略にもとづく計画的な取り崩し
    put(
      'plannedWithdrawal',
      `IF(OR(${age}<${R.withdrawalStartAge},(${invAfterExpense})<=0),0,` +
        `IF(${R.strategy}="毎年決まった額",MIN(${invAfterExpense},${R.fixedAmount}),` +
        `IF(${R.strategy}="毎年決まった率",(${invAfterExpense})*${R.fixedRate},` +
        `IF(AND(${R.strategy}="全額を現金化",${age}=${R.withdrawalStartAge}),${invAfterExpense},0))))`,
    );
    const cashAfterContrib = `${cashBefore}-${A('contribution', row)}+${A('expenseWithdrawal', row)}+${A('plannedWithdrawal', row)}`;
    const invAfterPlanned = `${invAfterExpense}-${A('plannedWithdrawal', row)}`;
    put(
      'withdrawal',
      `IF(${cashAfterContrib}<0,MIN(${invAfterPlanned},-(${cashAfterContrib})),0)`,
    );
    put('cash', `${cashAfterContrib}+${A('withdrawal', row)}`);
    put('investments', `${invAfterPlanned}-${A('withdrawal', row)}`);
    put('total', `${A('cash', row)}+${A('investments', row)}+${A('ideco', row)}`);
    put('shortYear', `IF(${A('total', row)}<0,${y},"")`);

    const evCell = calcWs.getCell(row, idx.events);
    evCell.value = result.rows[i].events.join(' / ');
    evCell.font = { ...FONT, size: 9, color: { argb: 'FF666666' } };
  }

  // ============================== 結果 ==============================
  outWs.getColumn(1).width = 2;
  outWs.getColumn(2).width = 30;
  outWs.getColumn(3).width = 18;
  outWs.getColumn(4).width = 76;

  const O = new InputSheet(outWs);
  O.skip(1);
  O.title('結果サマリー', 'すべて「計算」シートを参照した数式です。INPUT を変えると自動で更新されます。');

  const lastRow = 4 + years;
  const green = (row: number) => {
    const c = outWs.getCell(`C${row}`);
    c.font = { ...FONT, color: { argb: LINK_COLOR }, bold: true };
  };

  O.section('■ 主な指標');
  const kpis: [string, string, string, string][] = [
    ['finalTotal', '95歳時点の総資産', `'計算'!${A('total', lastRow)}`, MONEY],
    [
      'retireTotal',
      `退職時（${info.retireAge}歳）の総資産`,
      `IFERROR(INDEX(${COL('total')},MATCH(${R.retireAge},${COL('age')},0)),"—")`,
      MONEY,
    ],
    ['minTotal', '総資産が最も少なくなる額', `MIN(${COL('total')})`, MONEY],
    [
      'minYear',
      'その年',
      `INDEX(${COL('year')},MATCH(MIN(${COL('total')}),${COL('total')},0))`,
      '0',
    ],
    [
      'shortage',
      '資金ショートする年',
      `IF(COUNT(${COL('shortYear')})=0,"なし",MIN(${COL('shortYear')}))`,
      '0',
    ],
    ['finalCash', '95歳時点の現金・預金', `'計算'!${A('cash', lastRow)}`, MONEY],
    ['finalInvest', '95歳時点の投資資産', `'計算'!${A('investments', lastRow)}`, MONEY],
    ['sumGain', '生涯の運用益（投資）', `SUM(${COL('investmentGain')})`, MONEY],
    ['sumInterest', '生涯の預金利息', `SUM(${COL('cashInterest')})`, MONEY],
    ['sumContribution', '生涯の積立額', `SUM(${COL('contribution')})`, MONEY],
    [
      'sumWithdrawal',
      '生涯の投資取り崩し額',
      `SUM(${COL('expenseWithdrawal')})+SUM(${COL('plannedWithdrawal')})+SUM(${COL('withdrawal')})`,
      MONEY,
    ],
    [
      'avgBalance',
      '現役期の年間収支（平均）',
      `SUMIFS(${COL('balance')},${COL('age')},"<"&${R.retireAge})/COUNTIFS(${COL('age')},"<"&${R.retireAge})`,
      MONEY,
    ],
  ];
  kpis.forEach(([key, label, formula, fmt]) => {
    const r = O.currentRow;
    O.formula(key, label, formula, undefined, fmt);
    green(r);
  });
  O.skip();

  O.section('■ ワンポイントアドバイス');
  O.note('※ シミュレーション実行時点の結果にもとづく文章です（数式ではありません）。');
  advice.forEach((a, i) => {
    const r = O.currentRow;
    const mark = outWs.getCell(`B${r}`);
    mark.value = `${i + 1}. ${
      a.level === 'critical' ? '【要対策】' : a.level === 'warning' ? '【注意】' : a.level === 'good' ? '【良好】' : '【参考】'
    }`;
    mark.font = { ...FONT, bold: true };
    const t = outWs.getCell(`C${r}`);
    t.value = a.title;
    t.font = { ...FONT, bold: true };
    const b = outWs.getCell(`D${r}`);
    b.value = a.body;
    b.font = { ...FONT, size: 9 };
    b.alignment = { wrapText: true, vertical: 'top' };
    outWs.getRow(r).height = 42;
    O.skip();
  });
  O.skip();

  O.section('■ 総資産の推移');
  O.note('※ セルの棒はデータバーです。グラフにする場合は「年」と「総資産」の2列を選んで挿入してください。');
  const chartHeader = O.currentRow;
  ['年', '本人年齢', '現金・預金', '投資資産', '総資産'].forEach((h, i) => {
    const c = outWs.getCell(chartHeader, 2 + i);
    c.value = h;
    c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    c.alignment = { horizontal: 'center' };
  });
  outWs.getColumn(4).width = 16;
  outWs.getColumn(5).width = 16;
  outWs.getColumn(6).width = 22;
  const chartStart = chartHeader + 1;
  for (let i = 0; i < years; i += 1) {
    const r = chartStart + i;
    const src = 5 + i;
    (
      [
        ['B', A('year', src), '0'],
        ['C', A('age', src), '0'],
        ['D', A('cash', src), MONEY],
        ['E', A('investments', src), MONEY],
        ['F', A('total', src), MONEY],
      ] as const
    ).forEach(([col, addr, fmt]) => {
      const c = outWs.getCell(`${col}${r}`);
      c.value = { formula: `'計算'!${addr}`, date1904: false };
      c.font = { ...FONT, size: 9, color: { argb: LINK_COLOR } };
      c.numFmt = fmt;
    });
  }
  const chartEnd = chartStart + years - 1;
  // ExcelJS の型定義には dataBar の color が無いため、実装が受け取る形に合わせて渡す
  outWs.addConditionalFormatting({
    ref: `F${chartStart}:F${chartEnd}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        minLength: 0,
        maxLength: 100,
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb: 'FF2A78D6' },
        gradient: false,
        border: false,
        negativeBarColorSameAsPositive: false,
        negativeBarBorderColorSameAsPositive: false,
        axisPosition: 'auto',
        direction: 'leftToRight',
        showValue: true,
      } as unknown as Parameters<typeof outWs.addConditionalFormatting>[0]['rules'][number],
    ],
  });

  // ============================== はじめに ==============================
  intro.getColumn(1).width = 2;
  intro.getColumn(2).width = 110;
  const lines: [string, 'h1' | 'h2' | 'p' | 'note'][] = [
    ['ライフプランニング シート', 'h1'],
    [`LifePlanSim で作成（${new Date().toLocaleDateString('ja-JP')}）`, 'note'],
    ['', 'p'],
    ['■ シートの構成', 'h2'],
    ['① INPUT … 黄色いセルに入力します。ここを変えると②③が自動で計算し直されます。', 'p'],
    ['② 計算 … 1年ごとの収入・支出・資産をすべて数式で計算しています。数式バーで根拠を確認できます。', 'p'],
    ['③ 結果 … 主要な指標とアドバイス、総資産の推移をまとめています。', 'p'],
    ['', 'p'],
    ['■ 表記ルール', 'h2'],
    ['・青字＋黄色背景のセル ＝ 入力してください', 'p'],
    ['・黒字のセル ＝ 自動計算（数式）です', 'p'],
    ['・緑字のセル ＝ 他シートの数値を参照している表示専用セルです', 'p'],
    ['・金額の単位はすべて「万円」です', 'p'],
    ['', 'p'],
    ['■ 現金と投資の計算方法', 'h2'],
    ['・現金には「預金金利」、投資資産には「投資の想定利回り」をそれぞれ別に適用します。', 'p'],
    ['・毎年の収支を現金に反映したあと、「毎月の積立額×12」を現金から投資へ振り替えます。', 'p'],
    ['・積立額は、その年に使える現金の範囲に自動で抑えられます（現金がマイナスなら積立は 0）。', 'p'],
    ['・それでも現金が足りない年は、不足分だけ投資資産を取り崩します（「投資取崩額」列）。', 'p'],
    ['・投資も尽きると総資産がマイナスになり、「資金ショート判定」列に年が表示されます。', 'p'],
    ['', 'p'],
    ['■ 計算の前提', 'h2'],
    ['・手取り ＝ 額面 − 社会保険料 − 所得税 − 住民税。給与所得控除と所得税は INPUT の速算表を参照しています。', 'p'],
    ['・教育費は学習費調査などをもとにした年額の目安で、教育方針（公立／私立）に応じて自動で切り替わります。', 'p'],
    ['・住宅ローンは PMT 関数による元利均等返済。固定資産税・修繕費は物件価格に維持費率を掛けて計上します。', 'p'],
    ['・退職後の生活費は現役期の85%、年金は受給開始年齢から受け取る前提です。インフレは考慮していません。', 'p'],
    ['・簡易的な概算モデルです。実際の家計判断は専門家への相談も併せてご検討ください。', 'note'],
  ];
  lines.forEach((l, i) => {
    const c = intro.getCell(`B${i + 2}`);
    c.value = l[0];
    if (l[1] === 'h1') c.font = { ...FONT, size: 16, bold: true, color: { argb: HEAD_FILL } };
    else if (l[1] === 'h2') c.font = { ...FONT, size: 11, bold: true, color: { argb: HEAD_FILL } };
    else if (l[1] === 'note') c.font = { ...FONT, size: 9, color: { argb: 'FF666666' } };
    else c.font = FONT;
  });

  return wb;
}

/** ワークブックを作ってファイルとして保存する */
export async function downloadLifePlanExcel(input: WorkbookInput): Promise<SaveResult> {
  const wb = await buildLifePlanWorkbook(input);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return saveFile(blob, `ライフプランニングシート_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
