import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Connection,
  type OnMoveEnd,
  type OnNodeDrag,
} from '@xyflow/react';
import { useFlowStore } from '../store/useFlowStore';
import { TaskNode } from './nodes/TaskNode';
import { GroupNode } from './nodes/GroupNode';
import { DependencyEdge } from './edges/DependencyEdge';
import { ActionBars } from './ActionBars';
import {
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  TASK_NODE_HEIGHT,
  TASK_NODE_WIDTH,
} from '../domain/autoLayout';
import type { FlowSnapshot, TaskFlowNode } from '../types/flow';
import { validateConnection } from '../domain/graphValidation';

interface FlowCanvasProps {
  onOpenJsonExport: (jsonText: string) => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({ onOpenJsonExport }) => {
  const { zoomIn, zoomOut, zoomTo, fitView, getZoom } = useReactFlow();
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const preDragSnapshotRef = useRef<FlowSnapshot | null>(null);

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const baseDate = useFlowStore((s) => s.baseDate);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectedEdgeId = useFlowStore((s) => s.selectedEdgeId);
  const isSubmitted = useFlowStore((s) => s.isSubmitted);

  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const connectNodes = useFlowStore((s) => s.connectNodes);
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectEdge = useFlowStore((s) => s.selectEdge);
  const clearSelection = useFlowStore((s) => s.clearSelection);
  const addTaskNode = useFlowStore((s) => s.addTaskNode);
  const deleteSelected = useFlowStore((s) => s.deleteSelected);
  const assignNodeToGroup = useFlowStore((s) => s.assignNodeToGroup);
  const pushSnapshot = useFlowStore((s) => s.pushSnapshot);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);

  const nodeTypes = useMemo(
    () => ({
      taskNode: TaskNode,
      groupNode: GroupNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      dependencyEdge: DependencyEdge,
    }),
    [],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'dependencyEdge',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#64748b',
      },
    }),
    [],
  );

  const isValidConnection = useCallback(
    (connection: Connection | { source: string; target: string }) => {
      return validateConnection(
        connection.source,
        connection.target,
        nodes,
        edges,
      ).ok;
    },
    [nodes, edges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      connectNodes(connection);
    },
    [connectNodes],
  );

  const handleNodeDragStart = useCallback(() => {
    preDragSnapshotRef.current = {
      nodes: useFlowStore.getState().nodes,
      edges: useFlowStore.getState().edges,
      baseDate: useFlowStore.getState().baseDate,
    };
  }, []);

  const handleNodeDragStop: OnNodeDrag<TaskFlowNode> = useCallback(
    (_event, draggedNode) => {
      const preSnap = preDragSnapshotRef.current;
      preDragSnapshotRef.current = null;

      const currentNodes = useFlowStore.getState().nodes;
      const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));

      if (draggedNode.type === 'taskNode') {
        const parent = draggedNode.parentId
          ? nodeMap.get(draggedNode.parentId)
          : undefined;
        const absX = parent
          ? parent.position.x + draggedNode.position.x
          : draggedNode.position.x;
        const absY = parent
          ? parent.position.y + draggedNode.position.y
          : draggedNode.position.y;
        const centerX = absX + TASK_NODE_WIDTH / 2;
        const centerY = absY + TASK_NODE_HEIGHT / 2;

        const targetGroup = currentNodes.find((n) => {
          if (n.type !== 'groupNode') return false;
          const w = Number(n.width ?? n.style?.width) || DEFAULT_GROUP_WIDTH;
          const h = Number(n.height ?? n.style?.height) || DEFAULT_GROUP_HEIGHT;
          return (
            centerX >= n.position.x &&
            centerX <= n.position.x + w &&
            centerY >= n.position.y &&
            centerY <= n.position.y + h
          );
        });

        const nextParentId = targetGroup ? targetGroup.id : null;
        if ((draggedNode.parentId ?? null) !== nextParentId) {
          if (preSnap) pushSnapshot(preSnap);
          assignNodeToGroup(draggedNode.id, nextParentId);
          return;
        }
      }

      // Record drag history only if position actually changed
      if (preSnap) {
        const beforeNode = preSnap.nodes.find((n) => n.id === draggedNode.id);
        if (
          beforeNode &&
          (beforeNode.position.x !== draggedNode.position.x ||
            beforeNode.position.y !== draggedNode.position.y)
        ) {
          pushSnapshot(preSnap);
        }
      }
    },
    [assignNodeToGroup, pushSnapshot],
  );

  const handleMoveEnd: OnMoveEnd = useCallback((_evt, viewport) => {
    setZoomPercent(Math.round(viewport.zoom * 100));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key.toLowerCase() === 'z') {
        if (isEditableElement(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isEditableElement(e.target)) return;

      if (e.key === 'Tab' && selectedNodeId && !isSubmitted) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected?.type === 'taskNode') {
          e.preventDefault();
          addTaskNode({ sourceNodeId: selected.id });
        }
        return;
      }

      if (e.key === 'Enter' && selectedNodeId && !isSubmitted) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected?.type === 'taskNode') {
          e.preventDefault();
          addTaskNode({ siblingOfNodeId: selected.id });
        }
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        (selectedNodeId || selectedEdgeId) &&
        !isSubmitted
      ) {
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    nodes,
    selectedNodeId,
    selectedEdgeId,
    isSubmitted,
    baseDate,
    addTaskNode,
    deleteSelected,
    undo,
    redo,
  ]);

  return (
    <main className="flex-1 relative overflow-hidden flex flex-col canvas-grid">
      <ActionBars onOpenJsonExport={onOpenJsonExport} />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_e, node) => selectNode(node.id)}
        onEdgeClick={(_e, edge) => selectEdge(edge.id)}
        onPaneClick={() => clearSelection()}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        nodesDraggable={!isSubmitted}
        nodesConnectable={!isSubmitted}
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={0.4}
        maxZoom={1.8}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1.25} color="#cbd5e1" />
      </ReactFlow>

      {/* Bottom-Left Zoom & Shortcut Guide Bar */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        <div className="flex items-center bg-white/95 backdrop-blur border border-slate-200 shadow-sm rounded-xl p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              zoomOut();
              setZoomPercent(Math.round(getZoom() * 100));
            }}
            className="px-2 py-1 hover:bg-slate-100 rounded-lg text-slate-600 font-bold"
            title="縮小"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              zoomTo(1);
              setZoomPercent(100);
            }}
            className="px-2 py-1 hover:bg-slate-100 rounded-lg font-mono text-slate-600 min-w-[48px] text-center"
            title="100% にリセット"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            onClick={() => {
              zoomIn();
              setZoomPercent(Math.round(getZoom() * 100));
            }}
            className="px-2 py-1 hover:bg-slate-100 rounded-lg text-slate-600 font-bold"
            title="拡大"
          >
            +
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => fitView({ padding: 0.2 })}
            className="px-2 py-1 hover:bg-slate-100 rounded-lg text-slate-600 font-medium"
            title="全体を表示"
          >
            Fit
          </button>
        </div>

        <div className="hidden md:flex items-center gap-3 bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-xl px-3 py-1.5 text-[11px] text-slate-500">
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700 font-mono">
              Tab
            </kbd>{' '}
            右に後続追加
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700 font-mono">
              Enter
            </kbd>{' '}
            下に並列追加
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700 font-mono">
              Del
            </kbd>{' '}
            削除
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700 font-mono">
              Ctrl+Z
            </kbd>{' '}
            元に戻す
          </span>
        </div>
      </div>
    </main>
  );
};
