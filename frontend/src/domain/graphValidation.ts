import type { TaskFlowEdge, TaskFlowNode } from '../types/flow';

export interface ConnectionValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates whether a `precedes` edge from `source` to `target` is allowed.
 * Enforces:
 * - non-empty endpoints
 * - no self-loops
 * - no duplicate (source, target) edges
 * - no groupNode endpoints
 * - no cycles (DAG invariant)
 */
export function validateConnection(
  source: string | null | undefined,
  target: string | null | undefined,
  nodes: TaskFlowNode[],
  edges: TaskFlowEdge[],
): ConnectionValidationResult {
  if (!source || !target) {
    return { ok: false, reason: '接続元または接続先が指定されていません' };
  }

  if (source === target) {
    return { ok: false, reason: '自己ループ（同じタスクへの接続）はできません' };
  }

  const duplicate = edges.some((e) => e.source === source && e.target === target);
  if (duplicate) {
    return { ok: false, reason: 'すでに同じ先行・後続関係が存在します' };
  }

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  if (!sourceNode || !targetNode) {
    return { ok: false, reason: '接続対象のノードが見つかりません' };
  }

  if (sourceNode.type === 'groupNode' || targetNode.type === 'groupNode') {
    return { ok: false, reason: '親グループ枠には依存関係（precedes）を接続できません' };
  }

  // BFS from target to check if source is reachable (which would create a cycle)
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source);
    if (list) {
      list.push(edge.target);
    } else {
      adjacency.set(edge.source, [edge.target]);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [target];
  visited.add(target);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) {
      return { ok: false, reason: '循環依存になるため接続できません' };
    }
    const neighbors = adjacency.get(current);
    if (neighbors) {
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return { ok: true };
}
