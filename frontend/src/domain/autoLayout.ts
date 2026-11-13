import dagre from '@dagrejs/dagre';
import type { TaskFlowEdge, TaskFlowNode } from '../types/flow';

export const TASK_NODE_WIDTH = 256;
export const TASK_NODE_HEIGHT = 112;
export const DEFAULT_GROUP_WIDTH = 420;
export const DEFAULT_GROUP_HEIGHT = 260;

/**
 * Computes left-to-right (LR) coordinates using dagre for all taskNodes,
 * updates groupNode bounds to wrap their children, and keeps groupNodes
 * ordered before taskNodes.
 */
export function computeAutoLayout(
  nodes: TaskFlowNode[],
  edges: TaskFlowEdge[],
): TaskFlowNode[] {
  const taskNodes = nodes.filter((n) => n.type === 'taskNode');
  const groupNodes = nodes.filter((n) => n.type === 'groupNode');

  if (taskNodes.length === 0) {
    return nodes;
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 56,
    ranksep: 96,
    marginx: 60,
    marginy: 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const taskIdSet = new Set(taskNodes.map((n) => n.id));
  for (const node of taskNodes) {
    g.setNode(node.id, { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT });
  }

  for (const edge of edges) {
    if (taskIdSet.has(edge.source) && taskIdSet.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const absPositions = new Map<string, { x: number; y: number }>();
  let maxBottom = 0;

  for (const node of taskNodes) {
    const pos = g.node(node.id);
    const x = Math.round((pos.x - TASK_NODE_WIDTH / 2) / 10) * 10;
    const y = Math.round((pos.y - TASK_NODE_HEIGHT / 2) / 10) * 10;
    absPositions.set(node.id, { x, y });
    if (y + TASK_NODE_HEIGHT > maxBottom) {
      maxBottom = y + TASK_NODE_HEIGHT;
    }
  }

  // Group children by parentId
  const childrenByGroup = new Map<string, TaskFlowNode[]>();
  for (const task of taskNodes) {
    if (task.parentId) {
      const list = childrenByGroup.get(task.parentId);
      if (list) {
        list.push(task);
      } else {
        childrenByGroup.set(task.parentId, [task]);
      }
    }
  }

  const padX = 28;
  const padTop = 52;
  const padBottom = 28;
  let emptyGroupOffsetX = 60;

  const groupPositions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  for (const group of groupNodes) {
    const children = childrenByGroup.get(group.id) ?? [];
    if (children.length === 0) {
      const w = Number(group.width ?? group.style?.width) || DEFAULT_GROUP_WIDTH;
      const h = Number(group.height ?? group.style?.height) || DEFAULT_GROUP_HEIGHT;
      const x = emptyGroupOffsetX;
      const y = maxBottom + 60;
      emptyGroupOffsetX += w + 40;
      groupPositions.set(group.id, { x, y, width: w, height: h });
    } else {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const child of children) {
        const pos = absPositions.get(child.id)!;
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + TASK_NODE_WIDTH);
        maxY = Math.max(maxY, pos.y + TASK_NODE_HEIGHT);
      }
      const x = minX - padX;
      const y = minY - padTop;
      const width = maxX - minX + padX * 2;
      const height = maxY - minY + padTop + padBottom;
      groupPositions.set(group.id, { x, y, width, height });
    }
  }

  const nextGroups: TaskFlowNode[] = groupNodes.map((group) => {
    const box = groupPositions.get(group.id)!;
    return {
      ...group,
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      style: {
        ...group.style,
        width: box.width,
        height: box.height,
      },
    };
  });

  const nextTasks: TaskFlowNode[] = taskNodes.map((task) => {
    const abs = absPositions.get(task.id)!;
    if (task.parentId && groupPositions.has(task.parentId)) {
      const parentBox = groupPositions.get(task.parentId)!;
      return {
        ...task,
        position: {
          x: abs.x - parentBox.x,
          y: abs.y - parentBox.y,
        },
      };
    }
    return {
      ...task,
      position: abs,
    };
  });

  // Maintain invariant: groupNodes always precede taskNodes
  return [...nextGroups, ...nextTasks];
}
