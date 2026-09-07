import type { PlanAnswers } from './types';

export type StepId = 'income' | 'children' | 'housing' | 'moving' | 'bigExpense' | 'retirement';

export interface StepMeta {
  id: StepId;
  label: string;
  question: string;
}

export const STEPS: StepMeta[] = [
  { id: 'children', label: '子ども', question: '子どもは将来何人ほしいですか？' },
  { id: 'housing', label: '住宅', question: '家は購入する予定ですか？' },
  { id: 'moving', label: '引越し', question: '引越しの予定はありますか？' },
  {
    id: 'income',
    label: '働き方',
    question: '働き方や収入が変わる予定はありますか？',
  },
  {
    id: 'bigExpense',
    label: '大型出費',
    question: 'まとまった出費の予定はありますか？',
  },
  {
    id: 'retirement',
    label: '資産',
    question: '積立と取り崩しをどう計画しますか？',
  },
];

/**
 * 実際に通過するステップの並び。
 * 住宅購入を予定していても、購入までのあいだに賃貸へ引越すことがあるため引越しも尋ねる。
 */
export function activeSteps(_answers: PlanAnswers): StepMeta[] {
  return STEPS;
}

/** フロー図に表示する、各ステップの回答サマリー */
export function stepSummary(id: StepId, a: PlanAnswers): string | null {
  switch (id) {
    case 'income': {
      if (a.incomeEvents.length === 0) return '予定なし';
      const sorted = a.incomeEvents.slice().sort((x, y) => x.yearsLater - y.yearsLater);
      const head = sorted[0];
      const name = head.person === 'self' ? '本人' : '配偶者';
      return sorted.length === 1
        ? `${head.yearsLater}年後 ${name}の${head.label}`
        : `${sorted.length}件（${head.yearsLater}年後 ${name}の${head.label} ほか）`;
    }
    case 'children': {
      const final = a.children.finalStage;
      const finalLabel =
        final === 'highSchool' ? '高校卒' : final === 'graduate' ? '大学院卒' : '大学卒';
      const stages: [keyof typeof a.children.path, string][] = [
        ['kindergarten', '幼稚園'],
        ['elementary', '小学校'],
        ['juniorHigh', '中学校'],
        ['highSchool', '高校'],
        ['university', '大学'],
        ['graduate', '大学院'],
      ];
      const relevant = stages.filter(([key]) => {
        if (key === 'graduate') return final === 'graduate';
        if (key === 'university') return final !== 'highSchool';
        return true;
      });
      const priv = relevant.filter(([key]) => a.children.path[key] === 'private');
      const planLabel =
        priv.length === 0
          ? 'すべて公立'
          : priv.length === relevant.length
            ? 'すべて私立'
            : `${priv.map(([, label]) => label).join('・')}が私立`;
      const births = (a.children.births ?? []).slice().sort((x, y) => x - y);
      if (births.length === 0) return `これ以上の予定なし / ${finalLabel}・${planLabel}`;
      const when =
        births.length === 1
          ? `${births[0]}年後`
          : `${births.map((b) => `${b}年後`).join('・')}`;
      return `${births.length}人（${when}） / ${finalLabel}・${planLabel}`;
    }
    case 'housing':
      return a.housing.planned
        ? `${a.housing.yearsLater}年後 / ${a.housing.price}万円`
        : '購入予定なし';
    case 'moving': {
      const moves = (a.moves ?? []).slice().sort((x, y) => x.yearsLater - y.yearsLater);
      if (moves.length === 0) return '予定なし';
      if (moves.length === 1) {
        return `${moves[0].yearsLater}年後 / 家賃${moves[0].monthlyRent}万円`;
      }
      return `${moves.length}回（${moves[0].yearsLater}年後 ほか）`;
    }
    case 'retirement': {
      const r = a.retirement;
      if (!r) return '必要な分だけ';
      const changes = a.investmentChanges ?? [];
      const prefix = changes.length > 0 ? `積立変更${changes.length}件 / ` : '';
      switch (r.strategy) {
        case 'fixedAmount':
          return `${prefix}${r.withdrawalStartAge}歳から年${r.fixedAmount}万円ずつ`;
        case 'fixedRate':
          return `${prefix}${r.withdrawalStartAge}歳から毎年${r.fixedRate}%ずつ`;
        case 'cashOut':
          return `${prefix}${r.withdrawalStartAge}歳で全額を現金化`;
        default:
          return `${prefix}必要な分だけ取り崩す`;
      }
    }
    case 'bigExpense': {
      if (a.bigExpenses.length === 0) return '予定なし';
      const sorted = a.bigExpenses.slice().sort((x, y) => x.yearsLater - y.yearsLater);
      const head = sorted[0];
      return sorted.length === 1
        ? `${head.yearsLater}年後 ${head.label}（${head.amount}万円）`
        : `${sorted.length}件（${head.yearsLater}年後 ${head.label} ほか）`;
    }
    default:
      return null;
  }
}
