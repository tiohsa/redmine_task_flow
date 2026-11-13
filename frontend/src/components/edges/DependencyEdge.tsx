import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { TaskFlowEdge } from '../../types/flow';
import { useFlowStore } from '../../store/useFlowStore';

export const DependencyEdge: React.FC<EdgeProps<TaskFlowEdge>> = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
  }) => {
    const selectEdge = useFlowStore((s) => s.selectEdge);
    const delay = Number(data?.delay ?? 0) || 0;

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: selected ? '#0284c7' : '#64748b',
            strokeWidth: selected ? 3 : 2,
          }}
        />
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectEdge(id);
              }}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border transition ${
                selected
                  ? 'bg-sky-600 text-white border-sky-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'
              }`}
            >
              {delay > 0 ? `precedes +${delay}d` : 'precedes'}
            </button>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  },
);

DependencyEdge.displayName = 'DependencyEdge';
