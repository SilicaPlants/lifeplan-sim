import { useEffect, useState } from 'react';
import { BasicInfoForm } from './components/BasicInfoForm';
import { FlowRail } from './components/FlowRail';
import { QuestionCard } from './components/QuestionCard';
import { PlanManager } from './components/PlanManager';
import { Result } from './components/Result';
import { defaultAnswers, defaultBasicInfo } from './lib/defaults';
import { activeSteps } from './lib/flow';
import { diffPlan, parseAnswers, parseInfo, type SavedPlan } from './lib/storage';
import type { BasicInfo, PlanAnswers } from './lib/types';

type Phase = 'basic' | 'flow' | 'result';

const STORAGE_KEY = 'lifeplansim.v2';

interface Saved {
  info: BasicInfo;
  answers: PlanAnswers;
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (!parsed?.info || !parsed?.answers) return null;
    // 保存済みデータは古い版の可能性があるため、保存プランと同じ検査を通す
    const info = parseInfo(parsed.info);
    return { info, answers: parseAnswers(parsed.answers, info) };
  } catch {
    return null;
  }
}

export default function App() {
  const saved = loadSaved();
  const [info, setInfo] = useState<BasicInfo>(saved?.info ?? defaultBasicInfo);
  const [answers, setAnswers] = useState<PlanAnswers>(saved?.answers ?? defaultAnswers);
  const [phase, setPhase] = useState<Phase>('basic');
  const [flowIndex, setFlowIndex] = useState(0);
  const [managerOpen, setManagerOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<{ id: string; name: string } | null>(null);
  // 保存（または読み込み）した時点の内容。いまの条件と比べて変更点を出す
  const [savedSnapshot, setSavedSnapshot] = useState<{
    info: BasicInfo;
    answers: PlanAnswers;
  } | null>(null);
  const planDiffs = savedSnapshot ? diffPlan(savedSnapshot, { info, answers }) : [];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ info, answers }));
    } catch {
      /* プライベートモードなどで保存できない場合は無視する */
    }
  }, [info, answers]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase, flowIndex]);

  const steps = activeSteps(answers);
  const reached = phase === 'result' ? 2 : phase === 'flow' ? 1 : 0;

  const headerSteps = [
    { label: '基本情報', phase: 'basic' as Phase },
    { label: '質問', phase: 'flow' as Phase },
    { label: '結果', phase: 'result' as Phase },
  ];

  const goToStep = (i: number) => {
    if (i >= steps.length) {
      setPhase('result');
      return;
    }
    setFlowIndex(Math.max(0, i));
    setPhase('flow');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          LifePlanSim <span>ライフプランシミュレーター</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm header-save"
          onClick={() => setManagerOpen(true)}
          title={
            currentPlan && planDiffs.length > 0
              ? `保存した内容から${planDiffs.length}項目を変更しています`
              : undefined
          }
        >
          {currentPlan ? `保存：${currentPlan.name}` : 'プランを保存'}
          {currentPlan && planDiffs.length > 0 && (
            <span className="unsaved-badge">変更 {planDiffs.length}</span>
          )}
        </button>
        <nav className="steps" aria-label="進行状況">
          {headerSteps.map((s, i) => (
            <div key={s.phase} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span className="steps-sep" />}
              <button
                type="button"
                className={`steps-item is-clickable${phase === s.phase ? ' is-current' : ''}${
                  i < reached ? ' is-done' : ''
                }`}
                onClick={() => {
                  if (s.phase === 'flow') setFlowIndex(0);
                  setPhase(s.phase);
                }}
              >
                <span className="steps-num">{i < reached ? '✓' : i + 1}</span>
                {s.label}
              </button>
            </div>
          ))}
        </nav>
      </header>

      <main className="page">
        {phase === 'basic' && (
          <BasicInfoForm
            value={info}
            onChange={setInfo}
            onNext={() => {
              setFlowIndex(0);
              setPhase('flow');
            }}
          />
        )}

        {phase === 'flow' && (
          <div className="flow-layout">
            <FlowRail answers={answers} currentIndex={flowIndex} onJump={goToStep} />
            <QuestionCard
              step={steps[Math.min(flowIndex, steps.length - 1)]}
              index={Math.min(flowIndex, steps.length - 1)}
              total={steps.length}
              info={info}
              answers={answers}
              onChange={setAnswers}
              isLast={flowIndex >= steps.length - 1}
              onBack={() => {
                if (flowIndex === 0) setPhase('basic');
                else setFlowIndex(flowIndex - 1);
              }}
              onNext={() => goToStep(flowIndex + 1)}
            />
          </div>
        )}

        {phase === 'result' && (
          <Result
            info={info}
            answers={answers}
            onSave={() => setManagerOpen(true)}
            currentPlanId={currentPlan?.id ?? null}
            planDiffCount={planDiffs.length}
            onScenarioChange={(next) => {
              setInfo(next.info);
              setAnswers(next.answers);
            }}
            onLoadPlan={(plan) => {
              setInfo(plan.info);
              setAnswers(plan.answers);
              setSavedSnapshot({ info: plan.info, answers: plan.answers });
              setCurrentPlan({ id: plan.id, name: plan.name });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onBack={() => {
              // 「条件を変えて試す」は基本情報から見直せるように先頭へ戻す
              setFlowIndex(0);
              setPhase('basic');
            }}
            onRestart={() => {
              setInfo(defaultBasicInfo);
              setAnswers(defaultAnswers);
              setCurrentPlan(null);
              setSavedSnapshot(null);
              setFlowIndex(0);
              setPhase('basic');
            }}
          />
        )}
      </main>

      <PlanManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        info={info}
        answers={answers}
        currentPlanId={currentPlan?.id ?? null}
        onLoad={(plan: SavedPlan) => {
          setInfo(plan.info);
          setAnswers(plan.answers);
          setSavedSnapshot({ info: plan.info, answers: plan.answers });
          setFlowIndex(0);
          setPhase('result');
        }}
        onCurrentPlanChange={(id, name, snapshot) => {
          setCurrentPlan(id ? { id, name: name ?? currentPlan?.name ?? '' } : null);
          setSavedSnapshot(id ? (snapshot ?? { info, answers }) : null);
        }}
        diffs={planDiffs}
      />
    </div>
  );
}
