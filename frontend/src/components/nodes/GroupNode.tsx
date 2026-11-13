import React, { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { TaskFlowNode } from '../../types/flow';
import { useFlowStore } from '../../store/useFlowStore';
import { formatShortDate } from '../../domain/datePropagation';

export const GroupNode: React.FC<NodeProps<TaskFlowNode>> = memo(
  ({ id, data, selected }) => {
    const nodes = useFlowStore((s) => s.nodes);
    const serverErrors = useFlowStore((s) => s.validationErrors[id]);
    const isSubmitted = useFlowStore((s) => s.isSubmitted);
    const selectNode = useFlowStore((s) => s.selectNode);
    const triggerFocusSubject = useFlowStore((s) => s.triggerFocusSubject);

    const childrenCount = nodes.filter(
      (n) => n.type === 'taskNode' && n.parentId === id,
    ).length;
    const totalHours = data.estimatedHours ?? 0;
    const hasError =
      (serverErrors && serverErrors.length > 0) || !data.subject?.trim();

    return (
      <div
        className={`w-full h-full rounded-2xl border-2 border-dashed transition-colors flex flex-col select-none ${
          hasError
            ? 'border-rose-400 bg-rose-50/40'
            : selected
              ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200'
              : 'border-indigo-300 bg-indigo-50/30 hover:border-indigo-400'
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          selectNode(id);
          triggerFocusSubject();
        }}
      >
        <NodeResizer
          isVisible={selected && !isSubmitted}
          minWidth={280}
          minHeight={180}
          lineClassName="border-indigo-400!"
          handleClassName="w-2.5! h-2.5! bg-indigo-600! border-white! rounded!"
        />

        {/* Group Header */}
        <div className="px-3.5 py-2 flex items-center justify-between gap-2 border-b border-indigo-200/60 bg-indigo-100/50 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-600 text-white shrink-0">
              親チケット
            </span>
            <span
              className={`text-xs font-bold truncate ${
                data.subject ? 'text-indigo-950' : 'text-rose-500 italic'
              }`}
            >
              {data.subject || '（題名未入力）'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-white/80 text-indigo-800 border border-indigo-200 font-semibold">
              子: {childrenCount}件
            </span>
            <span className="px-1.5 py-0.5 rounded bg-white/80 text-indigo-800 border border-indigo-200 font-semibold">
              計 {totalHours}h
            </span>
            {(data.startDate || data.dueDate) && (
              <span className="text-indigo-700 font-medium">
                {formatShortDate(data.startDate)}-{formatShortDate(data.dueDate)}
              </span>
            )}
            {data.createdIssueId ? (
              <a
                href={`/issues/${data.createdIssueId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-bold rounded no-underline"
              >
                #{data.createdIssueId}
              </a>
            ) : (
              <span className="text-indigo-400">#NEW</span>
            )}
          </div>
        </div>
      </div>
    );
  },
);

GroupNode.displayName = 'GroupNode';
