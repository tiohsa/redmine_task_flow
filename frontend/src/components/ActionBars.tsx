import React, { useRef } from 'react';
import { useFlowStore } from '../store/useFlowStore';

interface ActionBarsProps {
  onOpenJsonExport: (jsonText: string) => void;
}

export const ActionBars: React.FC<ActionBarsProps> = ({ onOpenJsonExport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodes = useFlowStore((s) => s.nodes);
  const baseDate = useFlowStore((s) => s.baseDate);
  const past = useFlowStore((s) => s.past);
  const future = useFlowStore((s) => s.future);
  const isSubmitted = useFlowStore((s) => s.isSubmitted);
  const isSubmitting = useFlowStore((s) => s.isSubmitting);

  const addTaskNode = useFlowStore((s) => s.addTaskNode);
  const addGroupNode = useFlowStore((s) => s.addGroupNode);
  const applyAutoLayout = useFlowStore((s) => s.applyAutoLayout);
  const recalculateDates = useFlowStore((s) => s.recalculateDates);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const setBaseDate = useFlowStore((s) => s.setBaseDate);
  const submitBulkCreate = useFlowStore((s) => s.submitBulkCreate);
  const exportJson = useFlowStore((s) => s.exportJson);
  const importJson = useFlowStore((s) => s.importJson);
  const resetToSample = useFlowStore((s) => s.resetToSample);
  const resetFlow = useFlowStore((s) => s.resetFlow);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        importJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
      {/* Top-Left Floating Toolbar */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-xl p-1.5">
        <button
          type="button"
          disabled={isSubmitted}
          onClick={() => addTaskNode()}
          className="px-2.5 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg transition flex items-center gap-1.5 shadow-sm"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          タスク追加
        </button>

        <button
          type="button"
          disabled={isSubmitted}
          onClick={() => addGroupNode()}
          className="px-2.5 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-700 border border-indigo-200 rounded-lg transition flex items-center gap-1.5"
          title="子チケットをまとめる親チケット枠を追加"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="3"
              strokeDasharray="3 2"
            />
          </svg>
          親グループ枠
        </button>

        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        <button
          type="button"
          disabled={isSubmitted}
          onClick={applyAutoLayout}
          className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 rounded-lg transition flex items-center gap-1.5"
          title="左から右へ階層順に自動整列"
        >
          <svg
            className="w-3.5 h-3.5 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h10M4 18h14"
            />
          </svg>
          左→右 自動整列
        </button>

        <button
          type="button"
          disabled={isSubmitted}
          onClick={recalculateDates}
          className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 rounded-lg transition flex items-center gap-1.5"
          title="上流タスクの期日から下流の開始・期日を自動再計算"
        >
          <svg
            className="w-3.5 h-3.5 text-amber-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          日程自動伝播
        </button>

        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        <button
          type="button"
          disabled={isSubmitted || past.length === 0}
          onClick={undo}
          className="px-2 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 rounded-lg transition"
          title="元に戻す (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={isSubmitted || future.length === 0}
          onClick={redo}
          className="px-2 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 rounded-lg transition"
          title="やり直し (Ctrl+Shift+Z)"
        >
          Redo
        </button>
      </div>

      {/* Top-Right BaseDate & Global Action Bar */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-200 shadow-sm rounded-xl px-2.5 py-1.5 text-xs">
          <span className="text-slate-500 font-medium">フロー基準日:</span>
          <input
            type="date"
            aria-label="フロー基準日"
            value={baseDate}
            disabled={isSubmitted}
            onChange={(e) => setBaseDate(e.target.value)}
            className="border border-slate-200 rounded px-2 py-0.5 text-slate-700 font-medium focus:outline-none focus:border-sky-500 disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-xl p-1.5">
          <button
            type="button"
            onClick={() => onOpenJsonExport(exportJson())}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition"
          >
            JSON出力
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition"
          >
            JSON読込
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={resetToSample}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition"
          >
            サンプル初期化
          </button>

          {isSubmitted && (
            <button
              type="button"
              onClick={resetFlow}
              className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition"
            >
              新規フローとしてリセット
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting || isSubmitted || nodes.length === 0}
            onClick={submitBulkCreate}
            className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            {isSubmitting
              ? '登録中...'
              : isSubmitted
                ? '登録完了'
                : `Redmineに一括登録（${nodes.length}件）`}
          </button>
        </div>
      </div>
    </div>
  );
};
