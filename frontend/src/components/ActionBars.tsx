import React, { useRef } from 'react';
import { useFlowStore } from '../store/useFlowStore';

interface ActionBarsProps {
  onOpenJsonExport: (jsonText: string) => void;
  onOpenSavedFlows?: () => void;
  onOpenBulkNodeEdit?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface TooltipWrapperProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

const TooltipWrapper: React.FC<TooltipWrapperProps> = ({
  label,
  children,
  className = '',
}) => (
  <div className={`relative group ${className}`.trim()}>
    {children}
    <div
      role="tooltip"
      className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-150 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2.5 py-1 bg-slate-800 text-white text-xs font-medium rounded-lg whitespace-nowrap shadow-md z-30"
    >
      {label}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-800"
        aria-hidden="true"
      />
    </div>
  </div>
);

const ToolbarDivider: React.FC = () => (
  <div className="w-px h-6 bg-slate-200 mx-0.5" aria-hidden="true" />
);

export const ActionBars: React.FC<ActionBarsProps> = ({
  onOpenJsonExport,
  onOpenSavedFlows,
  onOpenBulkNodeEdit,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodes = useFlowStore((s) => s.nodes);
  const baseDate = useFlowStore((s) => s.baseDate);
  const past = useFlowStore((s) => s.past);
  const future = useFlowStore((s) => s.future);
  const isSubmitted = useFlowStore((s) => s.isSubmitted);
  const isSubmitting = useFlowStore((s) => s.isSubmitting);
  const hasBootstrap = useFlowStore((s) => s.bootstrap !== null);

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

  const bulkCreateLabel = isSubmitting
    ? '登録中...'
    : isSubmitted
      ? '登録完了'
      : `Redmineに一括登録 (${nodes.length}件)`;

  const fullscreenLabel = isFullscreen ? '全画面解除' : '全画面表示';

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
      {/* Top-Left Floating Toolbar */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-200/80 shadow-md rounded-2xl p-1.5">
        <TooltipWrapper label="タスク追加">
          <button
            type="button"
            disabled={isSubmitted}
            onClick={() => addTaskNode()}
            aria-label="タスク追加"
            className="w-10 h-10 rounded-xl bg-[#0077b6] hover:bg-[#006296] disabled:opacity-40 text-white flex items-center justify-center transition shadow-sm active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M12 8v8" />
              <path d="M8 12h8" />
            </svg>
          </button>
        </TooltipWrapper>

        <TooltipWrapper label="親グループ枠">
          <button
            type="button"
            disabled={isSubmitted}
            onClick={() => addGroupNode()}
            aria-label="親グループ枠"
            className="w-10 h-10 rounded-xl bg-indigo-50/80 hover:bg-indigo-100 disabled:opacity-40 text-indigo-600 border border-indigo-200 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" />
              <path d="M12 9v6" />
              <path d="M9 12h6" />
            </svg>
          </button>
        </TooltipWrapper>

        <ToolbarDivider />

        <TooltipWrapper label="左→右 自動整列">
          <button
            type="button"
            disabled={isSubmitted}
            onClick={applyAutoLayout}
            aria-label="左→右 自動整列"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="5" height="6" rx="1" />
              <rect x="3" y="14" width="5" height="6" rx="1" />
              <rect x="16" y="9" width="5" height="6" rx="1" />
              <path d="M8 7h4v5h4" />
              <path d="M8 17h4v-5" />
            </svg>
          </button>
        </TooltipWrapper>

        <TooltipWrapper label="日程自動伝播">
          <button
            type="button"
            disabled={isSubmitted}
            onClick={recalculateDates}
            aria-label="日程自動伝播"
            className="w-10 h-10 rounded-xl bg-white hover:bg-amber-50 disabled:opacity-40 text-amber-500 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="15" height="15" rx="2" />
              <path d="M13 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h15" />
              <path d="M14 15h7" />
              <path d="M18 12l3 3-3 3" />
            </svg>
          </button>
        </TooltipWrapper>

        <ToolbarDivider />

        <TooltipWrapper label="元に戻す (Undo)">
          <button
            type="button"
            disabled={isSubmitted || past.length === 0}
            onClick={undo}
            aria-label="Undo"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
            </svg>
          </button>
        </TooltipWrapper>

        <TooltipWrapper label="やり直す (Redo)">
          <button
            type="button"
            disabled={isSubmitted || future.length === 0}
            onClick={redo}
            aria-label="Redo"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 14l5-5-5-5" />
              <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
            </svg>
          </button>
        </TooltipWrapper>
      </div>

      {/* Top-Right BaseDate & Global Action Bar */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 bg-white/95 backdrop-blur border border-slate-200/80 shadow-md rounded-2xl p-1.5">
        <TooltipWrapper
          label="フロー基準日"
          className="flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-slate-50 border border-slate-200/80"
        >
          <svg
            className="w-4 h-4 text-slate-500 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <circle cx="12" cy="15" r="2" fill="currentColor" />
          </svg>
          <input
            type="date"
            aria-label="フロー基準日"
            value={baseDate}
            disabled={isSubmitted}
            onChange={(e) => setBaseDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none w-32 disabled:opacity-50"
          />
        </TooltipWrapper>

        <ToolbarDivider />

        {onOpenBulkNodeEdit && (
          <TooltipWrapper label="属性を一括変更">
            <button
              type="button"
              aria-label="属性を一括変更"
              aria-haspopup="dialog"
              disabled={!hasBootstrap || nodes.length < 2 || isSubmitting || isSubmitted}
              onClick={onOpenBulkNodeEdit}
              className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M9 6h11M9 12h7M9 18h4" />
                <path d="M4 6l1 1 2-2M4 12l1 1 2-2" />
                <path d="M16.5 14.5l3 3L15 22h-3v-3l4.5-4.5z" />
              </svg>
            </button>
          </TooltipWrapper>
        )}
        <TooltipWrapper label="保存・読込">
          <button
            type="button"
            onClick={() => onOpenSavedFlows?.()}
            aria-label="保存・読込"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
        </TooltipWrapper>

        <TooltipWrapper label="JSON出力">
          <button
            type="button"
            onClick={() => onOpenJsonExport(exportJson())}
            aria-label="JSON出力"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 18v-6" />
              <path d="M9 15l3-3 3 3" />
            </svg>
          </button>
        </TooltipWrapper>

        <TooltipWrapper label="JSON読込">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="JSON読込"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 12v6" />
              <path d="M9 15l3 3 3-3" />
            </svg>
          </button>
        </TooltipWrapper>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />

        <TooltipWrapper label="サンプル初期化">
          <button
            type="button"
            onClick={resetToSample}
            aria-label="サンプル初期化"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center justify-center transition active:scale-95"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 8v4l2 2" />
            </svg>
          </button>
        </TooltipWrapper>

        {isSubmitted && (
          <button
            type="button"
            onClick={resetFlow}
            className="h-10 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition active:scale-95 whitespace-nowrap"
          >
            新規フローとしてリセット
          </button>
        )}

        <TooltipWrapper label={bulkCreateLabel}>
          <button
            type="button"
            disabled={isSubmitting || isSubmitted || nodes.length === 0}
            onClick={submitBulkCreate}
            aria-label={bulkCreateLabel}
            className="relative w-10 h-10 rounded-xl bg-[#00965e] hover:bg-[#007f4f] disabled:bg-slate-300 disabled:text-slate-500 text-white flex items-center justify-center transition shadow-sm active:scale-95"
          >
            {isSubmitting ? (
              <svg
                className="w-5 h-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" className="opacity-25" />
                <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
              </svg>
            ) : isSubmitted ? (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                <path d="m9 13 2 2 4-4" />
              </svg>
            )}
            <span
              data-testid="bulk-create-count-badge"
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm"
            >
              {nodes.length}
            </span>
          </button>
        </TooltipWrapper>

        {onToggleFullscreen && (
          <>
            <ToolbarDivider />
            <TooltipWrapper label={isFullscreen ? '全画面解除 (Esc)' : '全画面表示'}>
              <button
                type="button"
                aria-pressed={isFullscreen}
                aria-label={fullscreenLabel}
                onClick={onToggleFullscreen}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition active:scale-95 ${
                  isFullscreen
                    ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200/80'
                }`}
              >
                {isFullscreen ? (
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                )}
              </button>
            </TooltipWrapper>
          </>
        )}
      </div>
    </div>
  );
};
