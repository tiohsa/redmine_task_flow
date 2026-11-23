import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { fetchBootstrap } from './api/client';
import { useFlowStore } from './store/useFlowStore';
import { FlowCanvas } from './components/FlowCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { ResultModal, ToastContainer } from './components/ResultModal';
import { SavedFlowsModal } from './components/SavedFlowsModal';
import { BulkNodeEditDialog } from './components/BulkNodeEditDialog';
import { isEditableElement } from './domain/dom';

interface AppProps {
  bootstrapUrl: string;
  bulkCreateUrl: string;
}

export const App: React.FC<AppProps> = ({ bootstrapUrl, bulkCreateUrl }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportJsonText, setExportJsonText] = useState<string | null>(null);
  const [savedFlowsModalOpen, setSavedFlowsModalOpen] = useState(false);
  const [bulkNodeEditOpen, setBulkNodeEditOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const initialize = useFlowStore((s) => s.initialize);
  const applyBulkNodeEdit = useFlowStore((s) => s.applyBulkNodeEdit);
  const resultModalOpen = useFlowStore((s) => s.resultModalOpen);

  useEffect(() => {
    if (!isFullscreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEditableElement(e.target)) return;
      if (exportJsonText !== null || resultModalOpen || savedFlowsModalOpen || bulkNodeEditOpen) {
        return;
      }
      e.preventDefault();
      setIsFullscreen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, exportJsonText, resultModalOpen, savedFlowsModalOpen, bulkNodeEditOpen]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    fetchBootstrap(bootstrapUrl)
      .then((data) => {
        if (!active) return;
        initialize(data, bulkCreateUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : '初期データの読み込みに失敗しました',
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bootstrapUrl, bulkCreateUrl, initialize]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[620px] bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
        タスクフローを読み込み中...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-[620px] bg-rose-50 border border-rose-200 rounded-xl p-6 text-center space-y-3">
        <div className="text-sm font-bold text-rose-700">
          タスクフローを初期化できませんでした
        </div>
        <div className="text-xs text-rose-600">{loadError}</div>
      </div>
    );
  }

  const containerClassName = isFullscreen
    ? 'task-flow-fullscreen fixed inset-0 flex bg-slate-100 overflow-hidden'
    : 'flex h-[calc(100vh-140px)] min-h-[640px] w-full bg-slate-100 border border-slate-200 rounded-xl overflow-hidden relative shadow-sm';

  return (
    <>
      <div
        data-testid="task-flow-editor-container"
        data-fullscreen={isFullscreen ? 'true' : 'false'}
        className={containerClassName}
      >
        <ReactFlowProvider>
          <FlowCanvas
            onOpenJsonExport={(txt) => setExportJsonText(txt)}
            onOpenSavedFlows={() => setSavedFlowsModalOpen(true)}
            onOpenBulkNodeEdit={() => setBulkNodeEditOpen(true)}
            bulkNodeEditOpen={bulkNodeEditOpen}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
          />
        </ReactFlowProvider>

        <InspectorPanel />
      </div>

      <ResultModal
        jsonText={exportJsonText}
        onClose={() => setExportJsonText(null)}
      />
      <SavedFlowsModal
        isOpen={savedFlowsModalOpen}
        onClose={() => setSavedFlowsModalOpen(false)}
      />
      <BulkNodeEditDialog
        isOpen={bulkNodeEditOpen}
        onApply={applyBulkNodeEdit}
        onClose={() => setBulkNodeEditOpen(false)}
      />
      <ToastContainer />
    </>
  );
};
