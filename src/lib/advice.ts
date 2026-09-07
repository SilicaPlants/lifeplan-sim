import { yen } from './format';
import type { Advice, BasicInfo, PlanAnswers, SimulationResult } from './types';

interface Scored extends Advice {
  score: number;
}

/** シミュレーション結果からワンポイントアドバイスを組み立てる */
export function buildAdvice(
  info: BasicInfo,
  answers: PlanAnswers,
  result: SimulationResult,
): Advice[] {
  const list: Scored[] = [];
  const { rows, depletion, minRow, atRetirement, final } = result;

  const workingRows = rows.filter((r) => r.age < info.retireAge);
  const avgIncome =
    workingRows.reduce((s, r) => s + r.income, 0) / Math.max(1, workingRows.length);
  const avgBalance =
    workingRows.reduce((s, r) => s + r.balance, 0) / Math.max(1, workingRows.length);
  const savingRate = avgIncome > 0 ? (avgBalance / avgIncome) * 100 : 0;
  const workingYears = Math.max(1, info.retireAge - info.age);

  // 1. 資金ショート
  if (depletion) {
    const shortfall = Math.abs(minRow.totalAssets);
    list.push({
      score: 100,
      level: 'critical',
      title: `${depletion.age}歳（${depletion.year}年）で貯蓄が底をつきます`,
      body: `このままの計画では${depletion.year}年に残高がマイナスに転じ、生涯で最大${yen(
        shortfall,
      )}不足します。退職までの${workingYears}年間で埋めるには、年あたり${yen(
        shortfall / workingYears,
      )}の収支改善（月${yen(
        shortfall / workingYears / 12,
      )}）が必要です。支出の見直し（住居費・保険・通信費）、就労期間の延長、共働き期間の確保を組み合わせて検討してください。`,
    });
  } else if (minRow.totalAssets < (info.livingCost * 12) / 2) {
    list.push({
      score: 90,
      level: 'warning',
      title: `${minRow.age}歳ごろに残高が生活費6か月分を下回ります`,
      body: `最も残高が少なくなるのは${minRow.year}年の${yen(
        minRow.totalAssets,
      )}です。病気や失業に備え、生活費6か月分（${yen(
        (info.livingCost * 12) / 2,
      )}）は常に現預金で確保できるよう、この時期の大きな支出を前後にずらすことを検討してください。`,
    });
  }

  // 2. 老後資金
  const retiredRows = rows.filter((r) => r.age >= 65);
  const retiredDeficit =
    retiredRows.length > 0
      ? retiredRows.reduce((s, r) => s + Math.min(0, r.balance), 0) / retiredRows.length
      : 0;
  if (atRetirement) {
    if (final.totalAssets < 0) {
      list.push({
        score: 85,
        level: 'critical',
        title: '老後の資金が不足する見込みです',
        body: `退職時（${info.retireAge}歳）の資産は${yen(
          atRetirement.totalAssets,
        )}ですが、年金だけでは年平均${yen(
          Math.abs(retiredDeficit),
        )}の赤字が続きます。65〜70歳まで働く、iDeCoや企業年金を上乗せする、退職後の生活費を1割抑えるといった対策で、必要額は大きく変わります。`,
      });
    } else if (final.totalAssets < info.livingCost * 12 * 3) {
      list.push({
        score: 70,
        level: 'warning',
        title: '老後資金にゆとりが少なめです',
        body: `95歳時点の残高は${yen(
          final.totalAssets,
        )}で、想定外の医療・介護費（自己負担は1人あたり300万〜600万円が目安）を賄うには心もとない水準です。退職を2〜3年遅らせるだけでも収支は大きく改善します。`,
      });
    } else {
      list.push({
        score: 40,
        level: 'good',
        title: '老後まで資産が持続する見込みです',
        body: `退職時に${yen(atRetirement.totalAssets)}、95歳時点でも${yen(
          final.totalAssets,
        )}を確保できる計画です。余裕分は繰り上げ返済や生前贈与、旅行・住み替えなど「使う計画」も併せて考えられます。`,
      });
    }
  }

  // 3. 貯蓄率
  if (savingRate < 10) {
    list.push({
      score: 75,
      level: 'warning',
      title: `現役期の貯蓄率が${savingRate.toFixed(0)}%と低めです`,
      body: `手取りに対する年間貯蓄は平均${yen(
        avgBalance,
      )}です。手取りの15〜20%（月${yen(
        (avgIncome * 0.175) / 12,
      )}前後）を先取りで貯蓄・積立に回す仕組みにすると、無理なく水準を引き上げられます。`,
    });
  } else if (savingRate >= 20) {
    list.push({
      score: 35,
      level: 'good',
      title: `現役期の貯蓄率は${savingRate.toFixed(0)}%と良好です`,
      body: `年平均${yen(
        avgBalance,
      )}を積み上げられる計画です。この水準を維持できるなら、余剰資金の一部を長期の資産運用に回すことで、同じ入金額でも将来の残高を伸ばせます。`,
    });
  }

  // 4. 住宅
  if (answers.housing.planned) {
    const purchaseYearRow = rows.find((r) => r.t === answers.housing.yearsLater);
    const householdGross = purchaseYearRow
      ? purchaseYearRow.selfGross + purchaseYearRow.spouseGross
      : info.income + (info.hasSpouse ? info.spouseIncome : 0);
    const burden = householdGross > 0 ? (result.annualLoanPayment / householdGross) * 100 : 0;
    const downRate = answers.housing.price > 0
      ? (answers.housing.downPayment / answers.housing.price) * 100
      : 0;
    const purchaseRow = rows.find((r) => r.t === answers.housing.yearsLater);
    const cashAfter = purchaseRow ? purchaseRow.totalAssets : 0;

    if (burden > 25) {
      list.push({
        score: 80,
        level: 'warning',
        title: `住宅ローンの返済負担率が${burden.toFixed(0)}%と高めです`,
        body: `年間返済額は${yen(
          result.annualLoanPayment,
        )}で、額面年収の25%を超えています。借入額を${yen(
          Math.max(0, answers.housing.price - answers.housing.downPayment) * 0.15,
        )}ほど圧縮するか、返済期間を延ばして月々の負担を下げると、教育費のピークと重なっても家計が回りやすくなります。`,
      });
    }
    if (downRate < 20) {
      list.push({
        score: 60,
        level: 'info',
        title: `頭金は物件価格の${downRate.toFixed(0)}%です`,
        body: `頭金2割（${yen(
          answers.housing.price * 0.2,
        )}）が目安とされます。ただし今は低金利のため、手元資金を残して借りる判断も合理的です。購入直後の残高は${yen(
          cashAfter,
        )}となる見込みで、生活費6か月分を割り込まないかを基準に考えてください。`,
      });
    }
  }

  // 引越し（購入の有無にかかわらず、住居費の変化を評価する）
  const moves = (answers.moves ?? []).slice().sort((a, b) => a.yearsLater - b.yearsLater);
  if (moves.length > 0) {
    const lifetimeHousing = rows.reduce((s2, r) => s2 + r.housing + r.lumpExpense, 0);
    const last = moves[moves.length - 1];
    const firstDiff = (moves[0].monthlyRent - info.rent) * 12;
    list.push({
      score: 50,
      level: 'info',
      title:
        moves.length === 1
          ? `${moves[0].yearsLater}年後の引越しで住居費が年${yen(Math.abs(firstDiff))}${
              firstDiff >= 0 ? '増えます' : '減ります'
            }`
          : `引越しを${moves.length}回予定しています`,
      body: `${moves
        .map(
          (m) =>
            `${m.yearsLater}年後：${m.label || '引越し'}（家賃 月${yen(m.monthlyRent)}、初期費用 ${yen(
              m.monthlyRent * m.initialCostMonths,
            )}）`,
        )
        .join(' / ')}。${
        answers.housing.planned
          ? `${answers.housing.yearsLater}年後の住宅購入までの住まいとして計算しています。`
          : `最終的な家賃は月${yen(
              last.monthlyRent,
            )}です。住居費は生涯で${yen(
              lifetimeHousing,
            )}になり、同じ支出でも購入なら資産が残るため、住み続ける年数が長いほど購入との比較に意味があります。`
      }`,
    });
  }

  // 5. 教育費のピーク
  const eduPeak = rows.reduce((a, b) => (b.education > a.education ? b : a), rows[0]);
  if (eduPeak.education > 0) {
    const peakDeficit = eduPeak.balance < 0;
    list.push({
      score: peakDeficit ? 78 : 30,
      level: peakDeficit ? 'warning' : 'info',
      title: `教育費のピークは${eduPeak.year}年（あなたが${eduPeak.age}歳のとき）で年${yen(
        eduPeak.education,
      )}`,
      body: peakDeficit
        ? `この年の収支は${yen(
            eduPeak.balance,
          )}の赤字になります。大学入学までの期間を使い、学資保険やつみたてNISAで1人あたり300万〜500万円を先に準備しておくと、直前の家計圧迫を避けられます。`
        : `ピーク時でも収支は${yen(
            eduPeak.balance,
          )}を維持できます。教育費は進路で大きく変わるため、私立・浪人・留学の可能性がある場合は1人あたり200万円程度の上振れを見込んでおくと安心です。`,
    });
  }

  // 6. 現金と投資の配分
  const emergencyFund = (info.livingCost * 12) / 2;
  const minCashRow = rows.reduce((a, b) => (b.cash < a.cash ? b : a), rows[0]);
  const withdrawalRow = rows.find((r) => r.withdrawal > 0) ?? null;
  const totalGain = rows.reduce((s2, r) => s2 + r.investmentGain, 0);
  const totalInterest = rows.reduce((s2, r) => s2 + r.cashInterest, 0);
  const startAssets = info.cash + info.investments;
  const investRatio = startAssets > 0 ? (info.investments / startAssets) * 100 : 0;

  if (minCashRow.cash < emergencyFund) {
    list.push({
      score: 72,
      level: 'warning',
      title: `${minCashRow.year}年ごろに現金が${yen(minCashRow.cash)}まで減ります`,
      body: `生活防衛資金の目安は生活費6か月分（${yen(
        emergencyFund,
      )}）です。${
        withdrawalRow
          ? `この計画では${withdrawalRow.year}年から投資資産の取り崩しが始まります。相場が下がっている時期に取り崩すと損失が確定するため、`
          : '現金が薄いと急な出費に投資の売却で対応することになるため、'
      }月々の積立額（現在 ${yen(
        info.monthlyInvestment,
      )}/月）を一時的に減らし、現金を厚くしておくことを検討してください。`,
    });
  } else if (investRatio < 20 && avgBalance > 0) {
    list.push({
      score: 58,
      level: 'info',
      title: `資産の${(100 - investRatio).toFixed(0)}%が現金・預金です`,
      body: `預金金利${info.cashRate}%に対し、投資の想定利回りは${
        info.investmentRate
      }%で計算しています。この差により、生涯の運用益は${yen(
        totalGain,
      )}、預金利息は${yen(
        totalInterest,
      )}となる見込みです。生活防衛資金（${yen(
        emergencyFund,
      )}）を現金で確保したうえで、余剰分を新NISAのつみたて投資枠などに回すと差はさらに広がります。`,
    });
  } else if (totalGain > 0) {
    list.push({
      score: 32,
      level: 'good',
      title: `投資の運用益は生涯で${yen(totalGain)}の見込みです`,
      body: `想定利回り${info.investmentRate}%・月${yen(
        info.monthlyInvestment,
      )}の積立を続けた場合の試算です（預金利息は${yen(
        totalInterest,
      )}）。利回りは前提次第で大きく変わるため、${
        info.investmentRate >= 6 ? '6%以上の想定はやや強気です。4%前後でも' : '3%と5%でも'
      }試算し、下振れした場合に計画が成り立つかを確認しておくと安心です。`,
    });
  }

  // 7. 働き方・収入の変化
  if (answers.incomeEvents.length > 0) {
    const working = rows.filter((r) => r.age < info.retireAge);
    // 前年より世帯の勤労収入がいちばん大きく減る年を探す
    let dropRow = working[0];
    let dropAmount = 0;
    for (let i = 1; i < working.length; i += 1) {
      const prev = working[i - 1].workIncome + working[i - 1].benefitIncome;
      const now = working[i].workIncome + working[i].benefitIncome;
      if (prev - now > dropAmount) {
        dropAmount = prev - now;
        dropRow = working[i];
      }
    }
    const benefitYears = rows.filter((r) => r.benefitIncome > 0).length;
    // 収入が落ちたあと元の水準まで戻るか
    const recovered = dropAmount > 0
      ? working.some(
          (r) =>
            r.t > dropRow.t &&
            r.workIncome + r.benefitIncome >=
              working[dropRow.t - 1].workIncome + working[dropRow.t - 1].benefitIncome,
        )
      : false;

    if (dropAmount > 30) {
      const label = dropRow.events.join('・') || '収入の変化';
      list.push({
        score: 68,
        level: 'warning',
        title: `${dropRow.year}年（${label}）に世帯の手取りが${yen(dropAmount)}減ります`,
        body: `${dropRow.year}年の世帯手取りは${yen(
          dropRow.workIncome + dropRow.benefitIncome,
        )}、年間収支は${yen(dropRow.balance)}になります。${
          recovered
            ? '収入は後の年で元の水準まで戻る計画ですが、この期間は積立を減らして現金を厚くしておくと安心です。'
            : 'この水準が続く前提のため、生活費の見直しか、復帰時期・働き方の再検討が必要です。'
        }${
          benefitYears > 0
            ? `育児休業給付金は非課税で社会保険料も免除されるため、手取りは額面の見た目より目減りしません（給付を${benefitYears}年分計上しています）。`
            : '育休を取る場合は育児休業給付金（休業前賃金の67%→50%、非課税）も収入として登録できます。'
        }`,
      });
    }

    const raises = answers.incomeEvents.filter(
      (e) => e.kind === 'salary' && e.newIncome > (e.person === 'self' ? info.income : info.spouseIncome),
    );
    if (raises.length > 0) {
      const best = raises.reduce((a, b) => (b.newIncome > a.newIncome ? b : a));
      const base = best.person === 'self' ? info.income : info.spouseIncome;
      list.push({
        score: 42,
        level: 'info',
        title: `${best.yearsLater}年後の${best.label}で年収が${yen(best.newIncome - base)}増える前提です`,
        body: `増収分をそのまま生活費に回さず、増えた手取りの半分を積立に上乗せする「先取り」を決めておくと、収入増がそのまま資産に反映されます。共働きに戻る場合は、社会保険の扶養から外れる年収の壁（106万円・130万円）も確認しておきましょう。`,
      });
    }
  }

  // 8. 大型出費
  if (answers.bigExpenses.length > 0) {
    const totalBig = rows.reduce((s2, r) => s2 + r.bigExpense, 0);
    const bigRows = rows.filter((r) => r.bigExpense > 0);
    const deficitRow = bigRows.find((r) => r.balance < 0);
    const repeating = answers.bigExpenses.filter((e) => e.repeatYears > 0);
    const repeatTotal = rows.reduce(
      (s2, r) =>
        s2 +
        (repeating.some(
          (e) => r.t >= e.yearsLater && (r.t - e.yearsLater) % Math.max(1, e.repeatYears) === 0,
        )
          ? repeating
              .filter(
                (e) =>
                  r.t >= e.yearsLater && (r.t - e.yearsLater) % Math.max(1, e.repeatYears) === 0,
              )
              .reduce((s3, e) => s3 + e.amount, 0)
          : 0),
      0,
    );
    list.push({
      score: deficitRow ? 66 : 34,
      level: deficitRow ? 'warning' : 'info',
      title: `大型出費は生涯で${yen(totalBig)}（${bigRows.length}回）になります`,
      body: `${
        deficitRow
          ? `${deficitRow.year}年（${deficitRow.events.join('・')}）はこの出費で収支が${yen(
              deficitRow.balance,
            )}の赤字になります。前後の年に分散させるか、目的別に積立てておくと家計への影響を抑えられます。`
          : `いずれの年も収支は黒字を保てる計画です。`
      }${
        repeating.length > 0
          ? `繰り返し発生する出費（${repeating
              .map((e) => `${e.label}：${e.repeatYears}年ごと`)
              .join('、')}）だけで生涯${yen(
              repeatTotal,
            )}になります。買い替え間隔を2年延ばす、1回あたりの予算を抑えるといった見直しは、単発の出費より効果が大きく出ます。`
          : ''
      }`,
    });
  }

  // 9. 老後の出口戦略
  let strategyPicked = false;
  let strategyIndex = -1;
  const retirement = answers.retirement;
  if (retirement) {
    const drawRows = rows.filter((r) => r.age >= retirement.withdrawalStartAge);
    const totalDrawn = rows.reduce((s2, r) => s2 + r.plannedWithdrawal + r.withdrawal, 0);
    const forced = rows.filter((r) => r.withdrawal > 0);
    const investLeft = final.investments;
    const startRow = rows.find((r) => r.age === retirement.withdrawalStartAge) ?? null;

    const detail: Record<string, string> = {
      asNeeded: `不足分だけ売る方法は、値上がりした資産をできるだけ長く運用に置ける一方、相場が下がっている年に大きく売らざるを得ないこともあります。${
        forced.length > 0
          ? `この計画では${forced[0].year}年から取り崩しが始まり、生涯で${yen(totalDrawn)}を売却します。`
          : '生涯を通じて取り崩しは発生しない見込みです。'
      }`,
      fixedAmount: `毎年${yen(
        retirement.fixedAmount,
      )}（月${yen(
        retirement.fixedAmount / 12,
      )}）を定額で取り崩す計画です。生活設計は立てやすい一方、相場が下がった年も同じ額を売るため、資産の減りが早まることがあります。95歳時点の投資資産は${yen(
        investLeft,
      )}の見込みです。`,
      fixedRate: `毎年、残高の${retirement.fixedRate}%を取り崩す計画です。相場に応じて取り崩し額が増減するため資産が枯渇しにくい反面、下落した年は使えるお金も減ります。${
        startRow
          ? `${startRow.year}年（${retirement.withdrawalStartAge}歳）の取り崩し額は${yen(
              startRow.plannedWithdrawal,
            )}の見込みです。`
          : ''
      }`,
      cashOut: `${retirement.withdrawalStartAge}歳で全額を現金化する計画です。値動きの不安はなくなりますが、その後は預金金利${
        info.cashRate
      }%しか付かないため、物価が年2%上がると30年で実質的な価値は約半分になります。一部だけ残して運用を続ける案も検討の余地があります。`,
    };

    strategyPicked = retirement.strategy !== 'asNeeded';
    strategyIndex = list.length;
    list.push({
      // 既定以外の出口戦略を選んだ場合は、その結果を優先して伝える
      score: retirement.strategy === 'asNeeded' ? 30 : 56,
      level: 'info',
      title:
        retirement.strategy === 'asNeeded'
          ? '老後は「必要な分だけ取り崩す」計画です'
          : retirement.strategy === 'fixedAmount'
            ? `老後は年${yen(retirement.fixedAmount)}の定額取り崩しです`
            : retirement.strategy === 'fixedRate'
              ? `老後は毎年${retirement.fixedRate}%の定率取り崩しです`
              : `${retirement.withdrawalStartAge}歳で投資を全額現金化する計画です`,
      body: `${detail[retirement.strategy] ?? ''}${
        drawRows.length > 0 && retirement.postReturnRate < info.investmentRate
          ? `取り崩し開始後の利回りは${retirement.postReturnRate}%（現役期は${info.investmentRate}%）として計算しています。`
          : ''
      }`,
    });
  }

  // 10. 税制優遇と物価
  const creditTotal = rows.reduce((s2, r) => s2 + r.loanTaxCredit, 0);
  if (creditTotal > 0) {
    const creditYears = rows.filter((r) => r.loanTaxCredit > 0).length;
    list.push({
      score: 44,
      level: 'good',
      title: `住宅ローン控除で${creditYears}年間に${yen(creditTotal)}戻ります`,
      body: `年末残高（上限${yen(
        answers.housing.creditLimit,
      )}）に${answers.housing.creditRate}%を掛けた額が、所得税と住民税から戻る計算です。控除しきれない年があると満額は使えないため、繰り上げ返済は控除期間が終わってからのほうが有利になることがあります。`,
    });
  }

  const idecoMonthly = info.idecoMonthly ?? 0;
  if (idecoMonthly > 0) {
    const idecoYears = rows.filter((r) => r.idecoContribution > 0).length;
    const totalContribution = rows.reduce((s2, r) => s2 + r.idecoContribution, 0);
    list.push({
      score: 40,
      level: 'good',
      title: `iDeCoの掛金${yen(idecoMonthly)}/月で所得控除を受けられます`,
      body: `${idecoYears}年間で${yen(
        totalContribution,
      )}を拠出する計画です。掛金は全額が所得控除になるため、所得税・住民税が毎年軽くなります（年収により掛金の15〜30%程度）。60歳まで引き出せない点と、受け取り時に退職所得控除・公的年金等控除の範囲を超えると課税される点に注意してください。`,
    });
  } else {
    list.push({
      score: 34,
      level: 'info',
      title: 'iDeCo・企業型DCの掛金が0になっています',
      body: `掛金は全額が所得控除になるため、同じ額を通常の投資に回すより有利です。会社員の上限は月2.0〜2.3万円（企業年金の有無による）で、月2.3万円なら年収500万円の人で毎年5万円前後の節税になります。60歳まで引き出せない資金であることを踏まえて検討してください。`,
    });
  }

  const inflation = info.inflationRate ?? 0;
  if (inflation > 0) {
    const lastPrice = final.priceLevel;
    list.push({
      score: 36,
      level: 'info',
      title: `物価上昇${inflation}%を見込むと、最終年の物価は今の${lastPrice.toFixed(2)}倍です`,
      body: `いまの生活費${yen(
        info.livingCost * 12,
      )}（年）が、最終年には${yen(
        info.livingCost * 12 * lastPrice,
      )}相当になる前提で計算しています。年金や退職金は据え置きで見ているため、実質的な受取額はその分目減りします。物価上昇に負けない運用ができるかが、老後資金の分かれ目です。`,
    });
  }

  // 深刻なものを先に、同じ深刻度なら影響の大きい順に並べる
  const weight: Record<Advice['level'], number> = {
    critical: 3000,
    warning: 2000,
    good: 1000,
    info: 0,
  };
  const strategyAdvice = strategyIndex >= 0 ? list[strategyIndex] : null;
  const sorted = list.sort((a, b) => weight[b.level] + b.score - (weight[a.level] + a.score));
  const top = sorted.slice(0, 5);
  // 既定以外の出口戦略をわざわざ選んだときは、その評価を必ず返す
  if (strategyPicked && strategyAdvice && !top.includes(strategyAdvice)) {
    top.push(strategyAdvice);
  }
  return top.map((a) => ({ level: a.level, title: a.title, body: a.body }));
}
