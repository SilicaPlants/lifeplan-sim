import { useEffect, useMemo, useRef, useState } from 'react';
import { yen } from '../lib/format';
import { simulate } from '../lib/simulate';
import {
  buildExport,
  downloadJson,
  loadPlans,
  newId,
  parseImport,
  savePlans,
  suggestName,
  type SavedPlan,
} from '../lib/storage';
import type { BasicInfo, PlanAnswers } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  info: BasicInfo;
  answers: PlanAnswers;
  currentPlanId: string | null;
  onLoad: (plan: SavedPlan) => void;
  onCurrentPlanChange: (id: string | null, name?: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function summary(info: BasicInfo, answers: PlanAnswers): string {
  const parts = [`${info.age}歳`, info.hasSpouse ? '夫婦' : '単身'];
  const kids = info.children.length + (answers.children.births?.length ?? 0);
  parts.push(kids > 0 ? `子${kids}人` : '子なし');
  parts.push(answers.housing.planned ? `住宅購入(${answers.housing.price}万円)` : '賃貸');
  if (answers.incomeEvents.length > 0) parts.push(`収入変化${answers.incomeEvents.length}件`);
  if (answers.bigExpenses.length > 0) parts.push(`大型出費${answers.bigExpenses.length}件`);
  return parts.join(' · ');
}

export function PlanManager({
  open,
  onClose,
  info,
  answers,
  currentPlanId,
  onLoad,
  onCurrentPlanChange,
}: Props) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const list = loadPlans();
    setPlans(list);
    const current = list.find((p) => p.id === currentPlanId);
    setName(current ? current.name : suggestName(info, answers, list));
    setMessage(null);
    setError(null);
    setConfirmingId(null);
  }, [open, currentPlanId, info, answers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const metrics = useMemo(() => {
    const map = new Map<string, { final: number; depletionYear: number | null }>();
    plans.forEach((p) => {
      try {
        const r = simulate(p.info, p.answers);
        map.set(p.id, {
          final: r.final.totalAssets,
          depletionYear: r.depletion ? r.depletion.year : null,
        });
      } catch {
        // 壊れたデータは指標なしで一覧に出す
      }
    });
    return map;
  }, [plans]);

  if (!open) return null;

  const persist = (next: SavedPlan[], msg: string) => {
    const sorted = next.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setPlans(sorted);
    if (savePlans(sorted)) {
      setMessage(msg);
      setError(null);
    } else {
      setError('保存できませんでした。ブラウザの保存容量がいっぱいか、プライベートモードの可能性があります。');
    }
  };

  const handleSaveNew = () => {
    const now = new Date().toISOString();
    const plan: SavedPlan = {
      id: newId(),
      name: name.trim() || suggestName(info, answers, plans),
      createdAt: now,
      updatedAt: now,
      info,
      answers,
    };
    onCurrentPlanChange(plan.id, plan.name);
    persist([plan, ...plans], `「${plan.name}」を保存しました。`);
  };

  const handleOverwrite = () => {
    const target = plans.find((p) => p.id === currentPlanId);
    if (!target) return;
    const updated: SavedPlan = {
      ...target,
      name: name.trim() || target.name,
      updatedAt: new Date().toISOString(),
      info,
      answers,
    };
    onCurrentPlanChange(updated.id, updated.name);
    persist(
      plans.map((p) => (p.id === updated.id ? updated : p)),
      `「${updated.name}」を上書きしました。`,
    );
  };

  const handleRename = (id: string, value: string) => {
    const next = plans.map((p) => (p.id === id ? { ...p, name: value.slice(0, 60) } : p));
    setPlans(next);
    savePlans(next);
  };

  const handleDuplicate = (plan: SavedPlan) => {
    const now = new Date().toISOString();
    const copy: SavedPlan = {
      ...plan,
      id: newId(),
      name: `${plan.name} のコピー`.slice(0, 60),
      createdAt: now,
      updatedAt: now,
    };
    persist([copy, ...plans], `「${copy.name}」を作成しました。`);
  };

  // window.confirm は iframe（Artifact など）でブロックされ、常に false になる。
  // そのため確認は行の中で 2 段階に分けて行う。
  const handleDelete = (plan: SavedPlan) => {
    setConfirmingId(null);
    if (plan.id === currentPlanId) onCurrentPlanChange(null);
    persist(
      plans.filter((p) => p.id !== plan.id),
      `「${plan.name}」を削除しました。`,
    );
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImport(text);
      if (imported.length === 0) {
        setError('読み込めるプランが見つかりませんでした。書き出したファイルか確認してください。');
        return;
      }
      const existingIds = new Set(plans.map((p) => p.id));
      const now = new Date().toISOString();
      const added = imported.map((p) =>
        existingIds.has(p.id) ? { ...p, id: newId(), name: `${p.name}（読込）`, updatedAt: now } : p,
      );
      persist([...added, ...plans], `${added.length}件のプランを読み込みました。`);
    } catch {
      setError('ファイルを読み込めませんでした。JSON 形式か確認してください。');
    }
  };

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="プランの保存"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>プランの保存</h2>
          <button type="button" className="modal-close" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <section className="save-box">
            <div className="field">
              <span className="field-label">
                いまの条件を保存
                <span className="field-hint">{summary(info, answers)}</span>
              </span>
              <span className="input-wrap">
                <input
                  type="text"
                  value={name}
                  maxLength={60}
                  placeholder="プラン名"
                  style={{ textAlign: 'left' }}
                  onChange={(e) => setName(e.target.value)}
                />
              </span>
            </div>
            <div className="save-actions">
              <button type="button" className="btn btn-primary" onClick={handleSaveNew}>
                新しいプランとして保存
              </button>
              {currentPlan && (
                <button type="button" className="btn btn-ghost" onClick={handleOverwrite}>
                  「{currentPlan.name}」に上書き
                </button>
              )}
            </div>
          </section>

          {message && <p className="save-message">{message}</p>}
          {error && <p className="save-error">{error}</p>}

          <div className="save-list-head">
            <span className="card-title">保存したプラン（{plans.length}件）</span>
            <span className="chip-row">
              <button
                type="button"
                className="link-btn"
                disabled={plans.length === 0}
                onClick={() => {
                  void downloadJson(
                    buildExport(plans),
                    `lifeplansim_plans_${new Date().toISOString().slice(0, 10)}.json`,
                  ).then((r) => {
                    if (r === 'failed') setError('ファイルに書き出せませんでした。');
                  });
                }}
              >
                ファイルに書き出す
              </button>
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                ファイルから読み込む
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImport(f);
                  e.target.value = '';
                }}
              />
            </span>
          </div>

          {plans.length === 0 ? (
            <p className="field-desc">
              まだ保存されたプランはありません。条件を変えたシミュレーションを保存しておくと、あとから呼び出して比べられます。
            </p>
          ) : (
            <ul className="plan-list">
              {plans.map((p) => {
                const m = metrics.get(p.id);
                return (
                  <li className={`plan-item${p.id === currentPlanId ? ' is-current' : ''}`} key={p.id}>
                    <div className="plan-main">
                      <input
                        className="plan-name"
                        value={p.name}
                        maxLength={60}
                        aria-label="プラン名"
                        onChange={(e) => handleRename(p.id, e.target.value)}
                      />
                      <div className="plan-meta">
                        {summary(p.info, p.answers)} ・ 更新 {formatDate(p.updatedAt)}
                      </div>
                    </div>
                    <div className="plan-metrics">
                      {m ? (
                        <>
                          <span className={m.final < 0 ? 'is-negative' : undefined}>
                            95歳 {yen(m.final)}
                          </span>
                          <em>
                            {m.depletionYear ? `${m.depletionYear}年にショート` : '資金ショートなし'}
                          </em>
                        </>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                    <div className="plan-actions">
                      {confirmingId === p.id ? (
                        <>
                          <span className="plan-confirm">削除しますか？</span>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(p)}
                          >
                            削除する
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmingId(null)}
                          >
                            やめる
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              onLoad(p);
                              onCurrentPlanChange(p.id, p.name);
                              onClose();
                            }}
                          >
                            開く
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDuplicate(p)}
                          >
                            複製
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmingId(p.id)}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="field-desc" style={{ marginTop: 14 }}>
            プランはこのブラウザに保存されます。別の端末で使う場合や念のためのバックアップには「ファイルに書き出す」をご利用ください。
          </p>
        </div>
      </div>
    </div>
  );
}
