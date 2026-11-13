import React from 'react';
import { useFlowStore } from '../store/useFlowStore';

interface JsonExportModalProps {
  jsonText: string | null;
  onClose: () => void;
}

export const ToastContainer: React.FC = () => {
  const toasts = useFlowStore((s) => s.toasts);
  const removeToast = useFlowStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  const badgeStyle = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-600 text-white border-emerald-700';
      case 'warning':
        return 'bg-amber-500 text-white border-amber-600';
      case 'error':
        return 'bg-rose-600 text-white border-rose-700';
      default:
        return 'bg-slate-800 text-white border-slate-900';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`px-3.5 py-2.5 rounded-xl border shadow-lg text-xs font-medium cursor-pointer transition ${badgeStyle(
            t.type,
          )}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};

export const ResultModal: React.FC<JsonExportModalProps> = ({
  jsonText,
  onClose,
}) => {
  const resultModalOpen = useFlowStore((s) => s.resultModalOpen);
  const resultModalMode = useFlowStore((s) => s.resultModalMode);
  const closeResultModal = useFlowStore((s) => s.closeResultModal);
  const nodes = useFlowStore((s) => s.nodes);
  const createdIssuesMap = useFlowStore((s) => s.createdIssuesMap);
  const validationErrors = useFlowStore((s) => s.validationErrors);
  const submitErrorMessages = useFlowStore((s) => s.submitErrorMessages);
  const addToast = useFlowStore((s) => s.addToast);

  if (jsonText !== null) {
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(jsonText);
        addToast('success', 'JSON をクリップボードにコピーしました');
      } catch {
        addToast('warning', 'クリップボードへのコピーに失敗しました');
      }
    };

    const handleDownload = () => {
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'task_flow.json';
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-base font-bold text-slate-800 m-0">
              フロー JSON エクスポート
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
            >
              ✕
            </button>
          </div>
          <div className="p-5 overflow-y-auto text-xs">
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto font-mono leading-relaxed">
              {jsonText}
            </pre>
          </div>
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition"
            >
              JSONをコピー
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
            >
              ダウンロード
            </button>
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
  }

  if (!resultModalOpen || !resultModalMode) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-base font-bold text-slate-800 m-0">
            {resultModalMode === 'success'
              ? 'Redmine への一括登録が完了しました'
              : '一括登録エラー'}
          </h3>
          <button
            type="button"
            onClick={closeResultModal}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto text-sm space-y-3">
          {resultModalMode === 'success' ? (
            <>
              <p className="text-xs text-slate-600">
                以下のチケットが作成され、Redmine の稼働日・親子ロールアップに基づく確定日程が反映されました。
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-semibold">チケット</th>
                      <th className="px-3 py-2 font-semibold">題名</th>
                      <th className="px-3 py-2 font-semibold">確定日程</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nodes.map((n) => {
                      const created = createdIssuesMap[n.id];
                      if (!created) return null;
                      return (
                        <tr key={n.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono">
                            <a
                              href={`/issues/${created.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-700 font-bold hover:underline"
                            >
                              #{created.id}
                            </a>
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {n.data.subject}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {created.startDate ?? '--'} 〜{' '}
                            {created.dueDate ?? '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-xs text-rose-700">
              <p className="font-semibold">
                エラーが発生したため、すべてのチケット作成をロールバックしました。
              </p>
              {submitErrorMessages.length > 0 && (
                <ul className="list-disc pl-5 space-y-1">
                  {submitErrorMessages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              )}
              {Object.entries(validationErrors).map(([tempId, msgs]) => {
                const node = nodes.find((n) => n.id === tempId);
                return (
                  <div
                    key={tempId}
                    className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg"
                  >
                    <div className="font-bold">
                      {node?.data.subject || tempId}
                    </div>
                    <ul className="list-disc pl-4 mt-1">
                      {msgs.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={closeResultModal}
            className="px-4 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
