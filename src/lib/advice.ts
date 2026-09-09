import { yen, yenFine } from './format';
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
      body: `${depletion.year}年に残高がマイナスへ転じ、生涯で最大${yen(
        shortfall,
      )}足りません。退職までの${workingYears}年で埋めるなら、年${yen(
        shortfall / workingYears,
      )}・月${yen(
        shortfall / workingYears / 12,
      )}の改善が要ります。効きやすいのは住居費と保険の見直し、そして働く期間を延ばすことです。`,
    });
  } else if (minRow.totalAssets < (info.livingCost * 12) / 2) {
    list.push({
      score: 90,
      level: 'warning',
      title: `${minRow.age}歳ごろに残高が生活費6か月分を下回ります`,
      body: `いちばん少ないのは${minRow.year}年の${yen(
        minRow.totalAssets,
      )}。病気や失業に備えるなら、生活費6か月分（${yen(
        (info.livingCost * 12) / 2,
      )}）は現預金で持っておきたいところです。この時期に重なっている大きな支出を、前後の年へずらせないか見てみてください。`,
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
        title: '老後の資金が足りません',
        body: `退職時（${info.retireAge}歳）の資産は${yen(
          atRetirement.totalAssets,
        )}。年金だけでは年${yen(
          Math.abs(retiredDeficit),
        )}の赤字が続きます。数年長く働く、iDeCoを足す、退職後の生活費を1割落とす。このどれか一つでも必要額はかなり変わります。`,
      });
    } else if (final.totalAssets < info.livingCost * 12 * 3) {
      list.push({
        score: 70,
        level: 'warning',
        title: '老後資金の余裕が薄めです',
        body: `95歳時点で${yen(
          final.totalAssets,
        )}。医療や介護の自己負担は1人300万〜600万円が目安なので、この残高だと足りなくなる年が出かねません。退職を2〜3年うしろにずらすだけでも景色が変わります。`,
      });
    } else {
      list.push({
        score: 40,
        level: 'good',
        title: '老後まで資産が持ちます',
        body: `退職時に${yen(atRetirement.totalAssets)}、95歳時点で${yen(
          final.totalAssets,
        )}残る計算です。ここまで余るなら、繰り上げ返済や住み替え、旅行といった「使う計画」も一緒に考えたいところです。`,
      });
    }
  }

  // 3. 貯蓄率
  if (savingRate < 10) {
    list.push({
      score: 75,
      level: 'warning',
      title: `現役期の貯蓄率が${savingRate.toFixed(0)}%と低めです`,
      body: `貯まるのは年平均${yen(
        avgBalance,
      )}。目安は手取りの15〜20%、月${yen(
        (avgIncome * 0.175) / 12,
      )}ほどです。余った分を貯めるのではなく、給料日に先に別口座へ移すほうが続きます。`,
    });
  } else if (savingRate >= 20) {
    list.push({
      score: 35,
      level: 'good',
      title: `現役期の貯蓄率は${savingRate.toFixed(0)}%あります`,
      body: `年平均${yen(
        avgBalance,
      )}のペース。この水準を保てるなら、当面使わない分を運用に回すと、同じ入金額でも最後の残高が変わってきます。`,
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
        body: `年間の返済は${yen(
          result.annualLoanPayment,
        )}で、額面年収の25%を超えています。この水準だと教育費のピークと重なったときに苦しくなります。借入を${yen(
          Math.max(0, answers.housing.price - answers.housing.downPayment) * 0.15,
        )}ほど減らすか、完済年齢を後ろにずらして月々を軽くしておくと安全側に寄せられます。`,
      });
    }
    if (downRate < 20) {
      list.push({
        score: 60,
        level: 'info',
        title: `頭金は物件価格の${downRate.toFixed(0)}%です`,
        body: `よく言われる目安は2割（${yen(
          answers.housing.price * 0.2,
        )}）ですが、金利が低いうちは手元を厚くしておく判断も十分あります。判断の基準は購入直後の残高で、この計画では${yen(
          cashAfter,
        )}。ここが生活費6か月分を切らないかどうかです。`,
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
            `${m.yearsLater}年後：${m.label || '引越し'}（家賃 月${yenFine(m.monthlyRent)}、初期費用 ${yen(
              m.monthlyRent * m.initialCostMonths,
            )}）`,
        )
        .join(' / ')}。${
        answers.housing.planned
          ? `${answers.housing.yearsLater}年後の住宅購入までの住まいとして計算しています。`
          : `最後は月${yenFine(
              last.monthlyRent,
            )}。住居費は生涯で${yen(
              lifetimeHousing,
            )}かかります。同じ額を払うなら購入は手元に資産が残る形なので、長く住むつもりなら比べてみる価値があります。`
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
          )}の赤字。大学に入るまでに1人300万〜500万円を別枠で貯めておけば、直前に慌てずに済みます。学資保険でもつみたてNISAでも構いません。`
        : `ピークでも収支は${yen(
            eduPeak.balance,
          )}で黒字です。ただし教育費は進路しだいで動きます。私立・浪人・留学の芽があるなら、1人あたり200万円ほど多めに見ておくと計画が崩れません。`,
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
      title: `${minCashRow.year}年ごろに現金が${
        minCashRow.cash < 1 ? 'ほぼなくなります' : `${yen(minCashRow.cash)}まで減ります`
      }`,
      body: `手元に置いておきたいのは生活費6か月分（${yen(
        emergencyFund,
      )}）。${
        withdrawalRow
          ? `この計画だと${withdrawalRow.year}年から投資を取り崩し始めます。相場が下がっている年に売ると損失が確定するので、`
          : '現金が薄いと、急な出費のたびに投資を売ることになります。'
      }この時期だけ積立（いま月${yenFine(
        info.monthlyInvestment,
      )}）を絞って、現金を厚くしておくのが無難です。`,
    });
  } else if (investRatio < 20 && avgBalance > 0) {
    list.push({
      score: 58,
      level: 'info',
      title: `資産の${(100 - investRatio).toFixed(0)}%が現金・預金です`,
      body: `預金金利${info.cashRate}%と投資の想定利回り${
        info.investmentRate
      }%の差は、生涯で運用益${yen(
        totalGain,
      )}に対し預金利息${yen(
        totalInterest,
      )}という形で出ます。生活防衛資金の${yen(
        emergencyFund,
      )}を現金で確保したうえで、残りを新NISAのつみたて枠へ回すと差はさらに開きます。`,
    });
  } else if (totalGain > 0) {
    list.push({
      score: 32,
      level: 'good',
      title: `投資の運用益は生涯で${yen(totalGain)}になります`,
      body: `想定利回り${info.investmentRate}%で月${yenFine(
        info.monthlyInvestment,
      )}を積み立て続けた場合の数字です（預金利息は${yen(
        totalInterest,
      )}）。${
        info.investmentRate >= 6
          ? '6%以上はやや強気なので、4%前後でも'
          : '利回りは前提しだいで大きく動きます。3%と5%でも'
      }計算して、下振れしたときに計画が持つかを見ておいてください。`,
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
        body: `この年の世帯手取りは${yen(
          dropRow.workIncome + dropRow.benefitIncome,
        )}、収支は${yen(dropRow.balance)}。${
          recovered
            ? '収入はあとで元の水準に戻る計画なので、この数年だけ積立を絞って現金を残しておけば乗り切れます。'
            : 'この水準がずっと続く前提です。生活費を見直すか、復帰の時期や働き方をもう一度考える必要があります。'
        }${
          benefitYears > 0
            ? `なお育児休業給付金は非課税で社会保険料も免除なので、手取りは額面ほど減りません（${benefitYears}年分を計上しています）。`
            : '育休を取るなら、育児休業給付金（休業前賃金の67%→50%、非課税）も収入として登録できます。'
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
        title: `${best.yearsLater}年後の${best.label}で年収が${yen(best.newIncome - base)}増えます`,
        body: `増えた手取りは生活費に吸収されがちです。半分は積立に回す、と先に決めておくと、収入増がそのまま資産に残ります。パートから正社員に戻る場合は、社会保険の扶養を外れる年収の壁（106万円・130万円）にも注意してください。`,
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
          ? `${deficitRow.year}年（${deficitRow.events.join('・')}）は、この出費で収支が${yen(
              deficitRow.balance,
            )}の赤字になります。年をずらすか、目的別に少しずつ貯めておけば影響を抑えられます。`
          : 'どの年も収支は黒字のままです。'
      }${
        repeating.length > 0
          ? `繰り返す出費（${repeating
              .map((e) => `${e.label}は${e.repeatYears}年ごと`)
              .join('、')}）だけで生涯${yen(
              repeatTotal,
            )}。買い替えの間隔を2年延ばす、1回の予算を落とす、といった見直しは単発の出費をいじるより効きます。`
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
      asNeeded: `不足分だけ売る方法なら、増えた資産をできるだけ長く運用に置けます。ただし相場が下がっている年でも、必要なら売らざるをえません。${
        forced.length > 0
          ? `この計画では${forced[0].year}年から取り崩しが始まり、生涯で${yen(totalDrawn)}を売ります。`
          : '今回の条件では、生涯を通じて取り崩しは発生しません。'
      }`,
      fixedAmount: `毎年${yen(
        retirement.fixedAmount,
      )}（月${yenFine(
        retirement.fixedAmount / 12,
      )}）ずつ取り崩します。使える額が読めるのは利点ですが、相場が下がった年も同じ額を売るぶん資産の減りは早まります。95歳時点で投資は${yen(
        investLeft,
      )}残る計算です。`,
      fixedRate: `残高の${retirement.fixedRate}%ずつ取り崩します。相場に合わせて額が上下するので資産は枯れにくい反面、下落した年は使えるお金も減ります。${
        startRow
          ? `${retirement.withdrawalStartAge}歳の初年度（${startRow.year}年）は${yen(
              startRow.plannedWithdrawal,
            )}です。`
          : ''
      }`,
      cashOut: `${retirement.withdrawalStartAge}歳で全額を現金に換えます。値動きを気にせず済む代わりに、その後は預金金利${
        info.cashRate
      }%だけ。物価が年2%上がるなら、30年で実質的な価値はおよそ半分です。一部は運用に残す形も考えられます。`,
    };

    strategyPicked = retirement.strategy !== 'asNeeded';
    strategyIndex = list.length;
    list.push({
      // 既定以外の出口戦略を選んだ場合は、その結果を優先して伝える
      score: retirement.strategy === 'asNeeded' ? 30 : 56,
      level: 'info',
      title:
        retirement.strategy === 'asNeeded'
          ? '老後は足りない分だけ取り崩す設定です'
          : retirement.strategy === 'fixedAmount'
            ? `老後は年${yen(retirement.fixedAmount)}ずつ取り崩す設定です`
            : retirement.strategy === 'fixedRate'
              ? `老後は毎年${retirement.fixedRate}%ずつ取り崩す設定です`
              : `${retirement.withdrawalStartAge}歳で投資を全額現金にする設定です`,
      body: `${detail[retirement.strategy] ?? ''}${
        drawRows.length > 0 && retirement.postReturnRate < info.investmentRate
          ? `取り崩しを始めたあとの利回りは${retirement.postReturnRate}%（現役期は${info.investmentRate}%）で計算しています。`
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
      )}）の${answers.housing.creditRate}%が、所得税と住民税から戻ってきます。控除は納めた税額が上限なので、払う税が少ない年は使い切れません。繰り上げ返済は控除期間が終わってからのほうが得になることが多い、というのはこのためです。`,
    });
  }

  const idecoMonthly = info.idecoMonthly ?? 0;
  if (idecoMonthly > 0) {
    const idecoYears = rows.filter((r) => r.idecoContribution > 0).length;
    const totalContribution = rows.reduce((s2, r) => s2 + r.idecoContribution, 0);
    list.push({
      score: 40,
      level: 'good',
      title: `iDeCoの掛金 月${yenFine(idecoMonthly)} が所得控除になります`,
      body: `${idecoYears}年で${yen(
        totalContribution,
      )}を積み立てる計画です。掛金は全額が所得控除なので、毎年その15〜30%（年収によります）ぶん税金が軽くなります。ただし60歳まで引き出せません。受け取るときも、退職所得控除や公的年金等控除の枠を超えると課税されます。`,
    });
  } else {
    list.push({
      score: 34,
      level: 'info',
      title: 'iDeCo・企業型DCの掛金が0のままです',
      body: `同じ額を積み立てるなら、iDeCoのほうが有利です。掛金が全額所得控除になるぶん、税金が減ります。会社員の上限は月2.0〜2.3万円（企業年金があるかどうかで変わります）で、月2.3万円・年収500万円なら毎年5万円前後の節税。ただし60歳まで引き出せないので、当面使う予定のないお金に限ります。`,
    });
  }

  const inflation = info.inflationRate ?? 0;
  if (inflation > 0) {
    const lastPrice = final.priceLevel;
    list.push({
      score: 36,
      level: 'info',
      title: `物価上昇${inflation}%なら、最終年の物価はいまの${lastPrice.toFixed(2)}倍`,
      body: `いま年${yen(
        info.livingCost * 12,
      )}の生活費が、最終年には${yen(
        info.livingCost * 12 * lastPrice,
      )}かかる計算です。年金は物価の伸びに追いつかない前提（マクロ経済スライド）で見ているので、受け取る額の重みはその分軽くなります。物価上昇に負けない運用ができるかどうかが、老後の分かれ目です。`,
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
