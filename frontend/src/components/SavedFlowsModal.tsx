import React, { useEffect, useState } from 'react';
import {
  MAX_SAVED_FLOWS,
  MAX_SAVED_FLOW_NAME_LENGTH,
} from '../domain/persistence';
import { useFlowStore } from '../store/useFlowStore';

interface SavedFlowsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatSavedTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SavedFlowsModal: React.FC<SavedFlowsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const savedFlows = useFlowStore((s) => s.savedFlows);
  const saveCurrentFlowAsNew = useFlowStore((s) => s.saveCurrentFlowAsNew);
  const overwriteSavedFlow = useFlowStore((s) => s.overwriteSavedFlow);
  const loadSavedFlow = useFlowStore((s) => s.loadSavedFlow);
  const deleteSavedFlow = useFlowStore((s) => s.deleteSavedFlow);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setErrorMessage(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAtLimit = savedFlows.length >= MAX_SAVED_FLOWS;
  const displayedError =
    errorMessage ??
    (isAtLimit
      ? `保存データは最大${MAX_SAVED_FLOWS}件までです。既存のデータを上書きまたは削除してください`
      : null);

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const res = saveCurrentFlowAsNew(name);
    if (!res.ok) {
      setErrorMessage(res.error ?? '保存に失敗しました');
      return;
    }
    setName('');
    setErrorMessage(null);
  };

  const handleLoad = (id: string) => {
    const res = loadSavedFlow(id);
    if (!res.ok) {
      setErrorMessage(res.error ?? '保存データの読込に失敗しました');
      return;
    }
    setErrorMessage(null);
    onClose();
  };

  const handleOverwrite = (id: string) => {
    const res = overwriteSavedFlow(id);
    if (!res.ok) {
      setErrorMessage(res.error ?? '上書き保存に失敗しました');
      return;
    }
    setErrorMessage(null);
  };

  const handleDelete = (id: string) => {
    const res = deleteSavedFlow(id);
    if (!res.ok) {
      setErrorMessage(res.error ?? '削除に失敗しました');
      return;
    }
    setErrorMessage(null);
  };

  return (
    <div
      data-testid="saved-flows-modal"
      role="dialog"
      aria-modal="true"
      aria-label="フローデータの保存・読込"
      className="task-flow-modal fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-slate-800 m-0">
              フローデータの保存・読込
            </h3>
            <span
              data-testid="saved-flows-count"
              className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                isAtLimit
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {savedFlows.length} / {MAX_SAVED_FLOWS} 件
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="モーダルを閉じる"
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          <form onSubmit={handleSaveNew} className="space-y-2">
            <label
              htmlFor="saved-flow-name-input"
              className="block text-xs font-semibold text-slate-700"
            >
              現在のフローを新規保存
            </label>
            <div className="flex items-center gap-2">
              <input
                id="saved-flow-name-input"
                type="text"
                aria-label="保存名"
                maxLength={MAX_SAVED_FLOW_NAME_LENGTH}
                placeholder={`保存名を入力（${MAX_SAVED_FLOW_NAME_LENGTH}文字以内）`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
              />
              <button
                type="submit"
                aria-label="新規保存"
                className="inline-flex items-center justify-center px-4 py-2 text-xs font-bold leading-4 bg-[#0077b6] hover:bg-[#006296] text-white rounded-lg transition whitespace-nowrap shadow-sm"
              >
                新規保存
              </button>
            </div>
            {displayedError && (
              <div
                role="alert"
                data-testid="saved-flows-error"
                className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg"
              >
                {displayedError}
              </div>
            )}
          </form>

          <div className="border-t border-slate-200 pt-4">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              保存済みデータ一覧
            </div>
            {savedFlows.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                保存されたフローデータはありません
              </div>
            ) : (
              <ul className="space-y-2 m-0 p-0 list-none">
                {savedFlows.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid="saved-flow-item"
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {entry.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>ノード {entry.data.nodes.length}件</span>
                        <span aria-hidden="true">•</span>
                        <span>更新: {formatSavedTimestamp(entry.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoad(entry.id)}
                        aria-label={`「${entry.name}」を読込`}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition"
                      >
                        読込
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOverwrite(entry.id)}
                        aria-label={`「${entry.name}」を上書き保存`}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition"
                      >
                        上書き保存
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        aria-label={`「${entry.name}」を削除`}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg transition"
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
