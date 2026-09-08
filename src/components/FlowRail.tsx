import { Fragment } from 'react';
import { activeSteps, stepSummary } from '../lib/flow';
import type { PlanAnswers } from '../lib/types';

interface Props {
  answers: PlanAnswers;
  currentIndex: number;
  onJump: (index: number) => void;
}

export function FlowRail({ answers, currentIndex, onJump }: Props) {
  const steps = activeSteps(answers);

  return (
    <nav className="flow-rail" aria-label="質問の流れ">
      <h3>質問の流れ（クリックで移動できます）</h3>
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <Fragment key={s.id}>
            {i > 0 && <div className="flow-connector" />}
            <button
              type="button"
              className={`flow-node${current ? ' is-current' : ''}${done ? ' is-done' : ''}`}
              onClick={() => onJump(i)}
              aria-current={current ? 'step' : undefined}
            >
              <span className="flow-dot">{done ? '✓' : i + 1}</span>
              <span>
                <span className="flow-label">{s.label}</span>
                {(done || current) && (
                  <span className="flow-summary" style={{ display: 'block' }}>
                    {stepSummary(s.id, answers)}
                  </span>
                )}
              </span>
            </button>
            {s.id === 'housing' && answers.housing.planned && i <= currentIndex && (
              <div className="flow-branch">購入までの住まいは「引越し」で設定</div>
            )}
          </Fragment>
        );
      })}
      <div className="flow-connector" />
      <button
        type="button"
        className={`flow-node${currentIndex >= steps.length ? ' is-current' : ''}`}
        onClick={() => onJump(steps.length)}
      >
        <span className="flow-dot">★</span>
        <span className="flow-label">結果</span>
      </button>
    </nav>
  );
}
