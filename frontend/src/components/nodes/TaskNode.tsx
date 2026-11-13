import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TaskFlowNode } from '../../types/flow';
import { useFlowStore } from '../../store/useFlowStore';
import { formatShortDate } from '../../domain/datePropagation';
import { validateNodeAttributes } from '../../domain/nodeValidation';

const TRACKER_STYLES = [
  'bg-sky-100 text-sky-800 border-sky-300',
  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-rose-100 text-rose-800 border-rose-300',
  'bg-violet-100 text-violet-800 border-violet-300',
];

const AVATAR_STYLES = [
  'bg-sky-600 text-white',
  'bg-indigo-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
];

export const TaskNode: React.FC<NodeProps<TaskFlowNode>> = memo(
  ({ id, data, selected, parentId }) => {
    const bootstrap = useFlowStore((s) => s.bootstrap);
    const serverErrors = useFlowStore((s) => s.validationErrors[id]);
    const isSubmitted = useFlowStore((s) => s.isSubmitted);
    const addTaskNode = useFlowStore((s) => s.addTaskNode);
    const selectNode = useFlowStore((s) => s.selectNode);
    const triggerFocusSubject = useFlowStore((s) => s.triggerFocusSubject);

    const trackerIdx =
      bootstrap?.trackers.findIndex((t) => t.id === Number(data.trackerId)) ?? 0;
    const tracker =
      trackerIdx >= 0
        ? bootstrap?.trackers[trackerIdx]
        : bootstrap?.trackers[0];
    const trackerClass =
      TRACKER_STYLES[(trackerIdx >= 0 ? trackerIdx : 0) % TRACKER_STYLES.length];

    const assigneeIdx =
      data.assignedToId !== null
        ? bootstrap?.assignable_users.findIndex(
            (u) => u.id === Number(data.assignedToId),
          ) ?? -1
        : -1;
    const assignee =
      assigneeIdx >= 0 ? bootstrap?.assignable_users[assigneeIdx] : null;
    const avatarClass =
      assigneeIdx >= 0
        ? AVATAR_STYLES[assigneeIdx % AVATAR_STYLES.length]
        : 'bg-slate-200 text-slate-500';
    const assigneeShort = assignee ? assignee.name.slice(0, 2) : '未';

    const localErrors = validateNodeAttributes(
      { id, type: 'taskNode', position: { x: 0, y: 0 }, data } as TaskFlowNode,
      bootstrap,
    );
    const allErrors =
      serverErrors && serverErrors.length > 0 ? serverErrors : localErrors;
    const hasError = allErrors.length > 0;

    return (
      <div
        className={`group relative w-[256px] h-[112px] bg-white rounded-xl border-2 transition-shadow flex flex-col justify-between select-none ${
          hasError
            ? 'border-rose-500 shadow-md ring-2 ring-rose-200'
            : selected
              ? 'border-sky-500 shadow-lg ring-2 ring-sky-200'
              : 'border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md'
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          selectNode(id);
          triggerFocusSubject();
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-3.5! h-3.5! bg-white! border-2! border-slate-400! group-hover:border-sky-500! -left-2!"
          title="先行タスクからの接続先 (Target)"
        />

        {/* Header */}
        <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded border truncate max-w-[110px] ${trackerClass}`}
            >
              {tracker?.name ?? 'タスク'}
            </span>
            {parentId && (
              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1 rounded shrink-0">
                子
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasError && (
              <span
                className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
                title={allErrors.join('\n')}
              >
                !
              </span>
            )}
            {data.createdIssueId ? (
              <a
                href={`/issues/${data.createdIssueId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-mono font-bold rounded text-[10px] no-underline"
              >
                #{data.createdIssueId}
              </a>
            ) : (
              <span className="text-[10px] font-mono text-slate-400">#NEW</span>
            )}
          </div>
        </div>

        {/* Body: Subject */}
        <div className="px-3 py-0.5 flex-1 flex items-center min-h-0">
          <div
            className={`text-xs font-bold line-clamp-2 leading-snug w-full ${
              data.subject ? 'text-slate-800' : 'text-rose-400 italic'
            }`}
          >
            {data.subject || '（ダブルクリックで題名入力）'}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 bg-slate-50/90 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-5 h-5 rounded-full ${avatarClass} text-[10px] font-bold flex items-center justify-center shrink-0`}
            >
              {assigneeShort}
            </span>
            <span className="truncate text-[10px] text-slate-500">
              {assignee?.name ?? '未割当'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
            <span className="font-semibold text-slate-700">
              {data.estimatedHours ?? 0}h
            </span>
            <span className="text-slate-300">|</span>
            <span
              className={
                data.lockDates ? 'text-amber-700 font-bold' : 'text-slate-500'
              }
              title={data.lockDates ? '手動日程固定中' : '自動計算日程'}
            >
              {data.lockDates ? '🔒' : ''}
              {formatShortDate(data.startDate)}-{formatShortDate(data.dueDate)}
            </span>
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          className="w-3.5! h-3.5! bg-sky-500! border-2! border-white! shadow-sm! -right-2!"
          title="ドラッグして後続タスクへ接続 (Source)"
        />

        {/* Quick add '+' button */}
        {!isSubmitted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addTaskNode({ sourceNodeId: id });
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-sky-600 hover:bg-sky-700 text-white shadow-md flex items-center justify-center transition z-20"
            title="右隣に後続タスクを追加 (Tab)"
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
          </button>
        )}
      </div>
    );
  },
);

TaskNode.displayName = 'TaskNode';
