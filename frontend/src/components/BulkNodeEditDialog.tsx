import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  evaluateBulkNodeEdit,
  MAX_BULK_NODE_EDIT_SELECTION,
  type BulkNodeEditChanges,
  type BulkNodeEditFailure,
  type BulkNodeEditIssue,
  type BulkNodeEditRequest,
} from '../features/bulk-node-edit';
import { useFlowStore } from '../store/useFlowStore';
import type { BootstrapData, TaskFlowNode } from '../types/flow';

interface DialogProps {
  isOpen: boolean;
  onApply: (request: BulkNodeEditRequest) => { ok: true } | BulkNodeEditFailure;
  onClose: () => void;
}

const FOOTER_BUTTON_CLASS =
  'inline-flex items-center justify-center min-w-[5.5rem] px-5 py-2 rounded-xl border text-sm transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0284c7] focus-visible:outline-offset-2';

const fields = [
  {
    key: 'trackerId',
    label: 'トラッカー',
    clearLabel: null,
    dotClass: 'bg-sky-500',
  },
  {
    key: 'priorityId',
    label: '優先度',
    clearLabel: null,
    dotClass: 'bg-amber-500',
  },
  {
    key: 'assignedToId',
    label: '担当者',
    clearLabel: '未割当',
    dotClass: 'bg-indigo-500',
  },
  {
    key: 'fixedVersionId',
    label: '対象バージョン',
    clearLabel: 'なし',
    dotClass: 'bg-emerald-500',
  },
] as const;

const TRACKER_BADGE_STYLES = [
  'bg-[#e0f2fe] text-[#0369a1]',
  'bg-[#dcfce7] text-[#15803d]',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
];

const AVATAR_STYLES = [
  'bg-[#0284c7] text-white',
  'bg-indigo-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
];

function isOutsideDialog(
  event: PointerEvent,
  dialog: HTMLDialogElement,
): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function BulkNodeEditForm({
  titleId,
  bootstrap,
  nodes,
  locked,
  onApply,
  onClose,
}: {
  titleId: string;
  bootstrap: BootstrapData;
  nodes: TaskFlowNode[];
  locked: boolean;
} & Pick<DialogProps, 'onApply' | 'onClose'>) {
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [changes, setChanges] = useState<BulkNodeEditChanges>({});
  const [applyIssues, setApplyIssues] = useState<BulkNodeEditIssue[]>([]);
  const controlsId = useId();
  const { candidates, result } = evaluateBulkNodeEdit(nodes, bootstrap, {
    nodeIds,
    changes,
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const missingIds = nodeIds.filter((id) => !nodeMap.has(id));
  const subjectCounts = new Map<string, number>();
  const childCounts = new Map<string, number>();
  for (const node of nodes) {
    const subject = node.data.subject || '題名なし';
    subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1);
    if (node.type === 'taskNode' && node.parentId) {
      childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
    }
  }
  const issues = result.ok ? applyIssues : result.issues;
  const isOverLimit = nodeIds.length > MAX_BULK_NODE_EDIT_SELECTION;
  const isEnoughSelected = nodeIds.length >= 2 && !isOverLimit;

  function describeNode(id: string) {
    const node = nodeMap.get(id);
    if (!node) return id;
    const subject = node.data.subject || '題名なし';
    return (subjectCounts.get(subject) ?? 0) > 1
      ? `${subject}・${id}`
      : subject;
  }

  function toggle(id: string) {
    setApplyIssues([]);
    setNodeIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function selectAllNodes() {
    setApplyIssues([]);
    setNodeIds(nodes.map((node) => node.id));
  }

  function deselectAllNodes() {
    setApplyIssues([]);
    setNodeIds([]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !result.ok) return;
    const applied = onApply({ nodeIds, changes });
    if (applied.ok) onClose();
    else setApplyIssues(applied.issues);
  }

  const selectionBadgeClass = isOverLimit
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : isEnoughSelected
      ? 'bg-sky-50 text-[#0284c7] border-sky-200'
      : 'bg-slate-100 text-slate-600 border-slate-200/80';

  return (
    <form
      onSubmit={submit}
      className="flex flex-col max-h-[90vh] overflow-hidden bg-white"
    >
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-[#0284c7] flex items-center justify-center shadow-xs shrink-0">
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M9 6h11M9 12h7M9 18h4" />
              <path d="M4 6l1 1 2-2M4 12l1 1 2-2" />
              <path d="M16.5 14.5l3 3L15 22h-3v-3l4.5-4.5z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="m-0 text-base font-bold text-slate-800 tracking-tight"
            >
              属性を一括変更
            </h2>
            <p className="m-0 text-xs text-slate-400 truncate">
              選択した複数のチケットノードに対して属性をまとめて更新します
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          title="閉じる"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#0284c7] focus-visible:outline-offset-2"
        >
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* メインコンテンツ */}
      <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
        {/* セクション1：対象ノード */}
        <fieldset className="min-w-0 border-0 p-0 m-0 space-y-3">
          <legend className="sr-only">対象ノード</legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="text-sm font-bold text-slate-700"
              >
                対象ノード
              </span>
              <span
                role="status"
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${selectionBadgeClass}`}
              >
                選択 <span className="mx-1 font-bold">{nodeIds.length}</span> 件
                / 上限 {MAX_BULK_NODE_EDIT_SELECTION} 件
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={selectAllNodes}
                className="px-2.5 py-1 rounded-lg font-medium text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0284c7] focus-visible:outline-offset-2"
              >
                すべて選択
              </button>
              <span aria-hidden="true" className="text-slate-300">
                |
              </span>
              <button
                type="button"
                onClick={deselectAllNodes}
                className="px-2.5 py-1 rounded-lg font-medium text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0284c7] focus-visible:outline-offset-2"
              >
                解除
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl bg-slate-50/60 p-2 max-h-64 overflow-y-auto space-y-1.5">
            {nodes.map((node, index) => {
              const inputId = `${controlsId}-node-${index}`;
              const isChecked = nodeIds.includes(node.id);
              const isParent = node.type === 'groupNode';
              const isChild = !isParent && Boolean(node.parentId);

              const cardStyle = isParent
                ? isChecked
                  ? 'bg-indigo-50/70 border-indigo-400 border-dashed ring-2 ring-indigo-500/15'
                  : 'bg-indigo-50/30 border-indigo-300/80 border-dashed hover:bg-indigo-50/60'
                : isChecked
                  ? 'bg-sky-50/60 border-[#0284c7] ring-2 ring-sky-500/15 shadow-xs'
                  : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50';

              const trackerIdx = bootstrap.trackers.findIndex(
                (t) => t.id === Number(node.data.trackerId),
              );
              const tracker =
                trackerIdx >= 0
                  ? bootstrap.trackers[trackerIdx]
                  : bootstrap.trackers[0];
              const trackerBadgeClass =
                TRACKER_BADGE_STYLES[
                  (trackerIdx >= 0 ? trackerIdx : 0) %
                    TRACKER_BADGE_STYLES.length
                ];

              const assigneeIdx =
                node.data.assignedToId !== null
                  ? bootstrap.assignable_users.findIndex(
                      (u) => u.id === Number(node.data.assignedToId),
                    )
                  : -1;
              const assignee =
                assigneeIdx >= 0
                  ? bootstrap.assignable_users[assigneeIdx]
                  : null;
              const avatarClass =
                assigneeIdx >= 0
                  ? AVATAR_STYLES[assigneeIdx % AVATAR_STYLES.length]
                  : 'bg-slate-200 text-slate-500';
              const avatarText = assignee ? assignee.name.slice(0, 2) : '未';
              const assigneeName = assignee ? assignee.name : '未割当';

              const metaText = isParent
                ? `子: ${childCounts.get(node.id) ?? 0}件 · 計 ${node.data.estimatedHours ?? 0}h`
                : node.data.estimatedHours != null
                  ? `${node.data.estimatedHours}h`
                  : null;

              return (
                <label
                  key={inputId}
                  htmlFor={inputId}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer select-none ${cardStyle}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(node.id)}
                      className="w-4 h-4 rounded border-slate-300 accent-[#0284c7] cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#0284c7] focus-visible:outline-offset-2"
                    />
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {isParent && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#6366f1] text-white shrink-0">
                          親チケット
                        </span>
                      )}
                      {isChild && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#e0e7ff] text-[#4338ca] shrink-0">
                          子
                        </span>
                      )}
                      {!isParent && tracker && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${trackerBadgeClass}`}
                        >
                          {tracker.name}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-800 truncate">
                        {describeNode(node.id)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 text-xs text-slate-500">
                    {!isParent && (
                      <div className="hidden sm:flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${avatarClass}`}
                        >
                          {avatarText}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {assigneeName}
                        </span>
                      </div>
                    )}
                    {metaText && (
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-md">
                        {metaText}
                      </span>
                    )}
                  </div>
                </label>
              );
            })}

            {missingIds.map((id) => {
              const missingInputId = `${controlsId}-missing-${id}`;
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-rose-300 bg-rose-50/70"
                >
                  <input
                    id={missingInputId}
                    type="checkbox"
                    checked
                    onChange={() => toggle(id)}
                    className="w-4 h-4 rounded border-rose-300 accent-rose-600 cursor-pointer shrink-0"
                  />
                  <label
                    htmlFor={missingInputId}
                    className="text-sm font-semibold text-rose-800 cursor-pointer"
                  >
                    見つからない対象（{id}）
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* セクション2：変更する属性 */}
        <fieldset className="min-w-0 border-0 p-0 m-0 space-y-3 pt-1">
          <legend className="sr-only">変更する属性</legend>
          <div className="flex items-center justify-between gap-2">
            <span
              aria-hidden="true"
              className="text-sm font-bold text-slate-700"
            >
              変更する属性
            </span>
            <span className="text-[11px] text-slate-400">
              「変更しない」以外の項目のみ上書きされます
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            {fields.map(({ key, label, clearLabel, dotClass }) => {
              const options = candidates[key];
              const requested = changes[key];
              const encoded =
                requested === null
                  ? 'clear'
                  : requested === undefined
                    ? ''
                    : String(requested);
              const invalid =
                requested !== undefined &&
                (!options ||
                  (requested !== null &&
                    !options.some(({ id }) => id === requested)));
              const hasFieldIssue =
                invalid || issues.some((issue) => issue.field === key);
              const isSelected = requested !== undefined;

              const selectStateClass = hasFieldIssue
                ? 'border-rose-400 bg-rose-50/30 text-rose-900 font-medium'
                : isSelected
                  ? 'border-[#0284c7] bg-sky-50/30 text-slate-900 font-medium'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600';

              return (
                <div key={key} className="space-y-1.5">
                  <label
                    htmlFor={`${controlsId}-${key}`}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
                    />
                    {label}
                  </label>
                  <div className="relative">
                    <select
                      id={`${controlsId}-${key}`}
                      className={`w-full appearance-none border rounded-xl pl-3.5 pr-9 py-2.5 text-sm transition-all cursor-pointer focus:border-[#0284c7] focus:ring-2 focus:ring-sky-500/15 focus-visible:outline-2 focus-visible:outline-[#0284c7] focus-visible:outline-offset-1 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${selectStateClass}`}
                      disabled={!options && requested === undefined}
                      aria-invalid={hasFieldIssue || undefined}
                      aria-describedby={`${controlsId}-issues`}
                      value={encoded}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        const change =
                          value === ''
                            ? undefined
                            : value === 'clear'
                              ? null
                              : Number(value);
                        setApplyIssues([]);
                        setChanges((current) => ({
                          ...current,
                          [key]: change,
                        }));
                      }}
                    >
                      <option value="">変更しない</option>
                      {invalid && (
                        <option value={encoded} disabled>
                          選択できない指定（{requested ?? clearLabel}）
                        </option>
                      )}
                      {options && clearLabel && (
                        <option value="clear">{clearLabel}</option>
                      )}
                      {options?.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                  {!options && (
                    <span className="block text-xs text-slate-500">
                      選択対象のトラッカーでは指定できません
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* バリデーションメッセージ */}
        <div
          id={`${controlsId}-issues`}
          role="status"
          className={
            locked || issues.length > 0
              ? 'flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-rose-50/90 border border-rose-200/80 text-rose-700 text-xs font-medium transition-all'
              : 'sr-only'
          }
        >
          {(locked || issues.length > 0) && (
            <>
              <svg
                aria-hidden="true"
                className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="min-w-0 flex-1">
                {locked ? (
                  <span>現在のフローは編集できません</span>
                ) : (
                  <ul className="m-0 max-h-24 list-disc overflow-auto pl-4 space-y-0.5">
                    {issues.map(({ nodeId, message }, index) => (
                      <li key={index}>
                        {nodeId && `${describeNode(nodeId)}：`}
                        {message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* フッター */}
      <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className={`${FOOTER_BUTTON_CLASS} border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium shadow-2xs`}
        >
          取消
        </button>
        <button
          type="submit"
          disabled={locked || !result.ok}
          className={`${FOOTER_BUTTON_CLASS} border-transparent bg-[#0284c7] hover:bg-[#0369a1] disabled:bg-sky-600/35 disabled:cursor-not-allowed text-white font-semibold shadow-sm`}
        >
          適用
        </button>
      </div>
    </form>
  );
}

export function BulkNodeEditDialog({ isOpen, onApply, onClose }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bootstrap = useFlowStore((state) => state.bootstrap);
  const nodes = useFlowStore((state) => state.nodes);
  const locked = useFlowStore((state) => state.isSubmitting || state.isSubmitted);
  const shouldOpen = isOpen && bootstrap !== null;

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (shouldOpen && !element.open) element.showModal();
    if (!shouldOpen && element.open) element.close();
  }, [shouldOpen]);

  // Fallback for browsers without native <dialog closedby="any"> support (e.g. Safari)
  useEffect(() => {
    const element = dialog.current;
    if (!element || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutsideDialog(event, element);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutsideDialog(event, element)) {
        element.close();
      }
      pressedOutside = false;
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="task-flow-bulk-edit-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
    >
      {shouldOpen && (
        <BulkNodeEditForm
          titleId={titleId}
          bootstrap={bootstrap}
          nodes={nodes}
          locked={locked}
          onApply={onApply}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}
