import type { TaskFlowEdge, TaskFlowNode } from '../types/flow';

/**
 * Returns today's date in YYYY-MM-DD format (local time).
 */
export function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds calendar days to a YYYY-MM-DD string using UTC to avoid DST/timezone shifts.
 */
export function addCalendarDays(ymd: string, days: number): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return ymd;
  }
  const [year, month, day] = parts;
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats YYYY-MM-DD as M/D for compact card display.
 */
export function formatShortDate(ymd: string | null | undefined): string {
  if (!ymd) return '--/--';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/**
 * Returns taskNode IDs in topological order (upstream -> downstream).
 */
export function topologicalSortTaskIds(
  nodes: TaskFlowNode[],
  edges: TaskFlowEdge[],
): string[] {
  const taskNodes = nodes.filter((n) => n.type === 'taskNode');
  const taskIdSet = new Set(taskNodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const n of taskNodes) {
    inDegree.set(n.id, 0);
    outgoing.set(n.id, []);
  }

  for (const edge of edges) {
    if (!taskIdSet.has(edge.source) || !taskIdSet.has(edge.target)) {
      continue;
    }
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }

  const queue: string[] = [];
  for (const n of taskNodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      queue.push(n.id);
    }
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
      }
    }
  }

  // Fallback for any remaining nodes (should not happen in valid DAGs)
  if (ordered.length < taskNodes.length) {
    const orderedSet = new Set(ordered);
    for (const n of taskNodes) {
      if (!orderedSet.has(n.id)) {
        ordered.push(n.id);
      }
    }
  }

  return ordered;
}

/**
 * Propagates calendar-day preview dates across taskNodes in topological order
 * and rolls up startDate, dueDate, and estimatedHours to parent groupNodes.
 */
export function propagateDates(
  nodes: TaskFlowNode[],
  edges: TaskFlowEdge[],
  baseDate?: string,
): TaskFlowNode[] {
  const effectiveBaseDate =
    baseDate && /^\d{4}-\d{2}-\d{2}$/.test(baseDate) ? baseDate : todayYmd();

  const nodeMap = new Map<string, TaskFlowNode>(nodes.map((n) => [n.id, n]));
  const taskIdSet = new Set(
    nodes.filter((n) => n.type === 'taskNode').map((n) => n.id),
  );

  const incomingEdgesMap = new Map<string, TaskFlowEdge[]>();
  for (const edge of edges) {
    if (!taskIdSet.has(edge.source) || !taskIdSet.has(edge.target)) {
      continue;
    }
    const list = incomingEdgesMap.get(edge.target);
    if (list) {
      list.push(edge);
    } else {
      incomingEdgesMap.set(edge.target, [edge]);
    }
  }

  const orderedIds = topologicalSortTaskIds(nodes, edges);
  const computedTaskDates = new Map<
    string,
    { startDate: string | null; dueDate: string | null; estimatedHours: number | null }
  >();

  for (const id of orderedIds) {
    const node = nodeMap.get(id);
    if (!node) continue;

    if (node.data.lockDates) {
      computedTaskDates.set(id, {
        startDate: node.data.startDate,
        dueDate: node.data.dueDate,
        estimatedHours: node.data.estimatedHours,
      });
      continue;
    }

    const incoming = incomingEdgesMap.get(id) ?? [];
    let startDate: string | null = node.data.startDate;

    if (incoming.length === 0) {
      startDate = effectiveBaseDate;
    } else {
      const candidateStarts: string[] = [];
      for (const edge of incoming) {
        const srcDates = computedTaskDates.get(edge.source);
        if (srcDates?.dueDate) {
          const rawDelay = Number(edge.data?.delay ?? 0);
          const delay = Number.isFinite(rawDelay)
            ? Math.max(0, Math.min(60, Math.trunc(rawDelay)))
            : 0;
          candidateStarts.push(addCalendarDays(srcDates.dueDate, 1 + delay));
        }
      }
      if (candidateStarts.length > 0) {
        candidateStarts.sort();
        startDate = candidateStarts[candidateStarts.length - 1];
      }
      // When all preceding tasks have dueDate: null, startDate remains unchanged
    }

    let dueDate: string | null = node.data.dueDate;
    if (startDate) {
      const rawHours = node.data.estimatedHours;
      const effectiveHours =
        rawHours !== null && rawHours !== undefined && rawHours > 0 ? rawHours : 8;
      const durationDays = Math.max(1, Math.ceil(effectiveHours / 8));
      dueDate = addCalendarDays(startDate, durationDays - 1);
    }

    computedTaskDates.set(id, {
      startDate,
      dueDate,
      estimatedHours: node.data.estimatedHours,
    });
  }

  // Group children by parentId for rollup
  const childrenByParent = new Map<
    string,
    Array<{ startDate: string | null; dueDate: string | null; estimatedHours: number | null }>
  >();
  for (const node of nodes) {
    if (node.type === 'taskNode' && node.parentId) {
      const computed = computedTaskDates.get(node.id) ?? {
        startDate: node.data.startDate,
        dueDate: node.data.dueDate,
        estimatedHours: node.data.estimatedHours,
      };
      const list = childrenByParent.get(node.parentId);
      if (list) {
        list.push(computed);
      } else {
        childrenByParent.set(node.parentId, [computed]);
      }
    }
  }

  return nodes.map((node) => {
    if (node.type === 'taskNode') {
      const computed = computedTaskDates.get(node.id);
      if (!computed) return node;
      if (
        computed.startDate === node.data.startDate &&
        computed.dueDate === node.data.dueDate
      ) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          startDate: computed.startDate,
          dueDate: computed.dueDate,
        },
      };
    }

    // groupNode rollup
    const children = childrenByParent.get(node.id) ?? [];
    if (children.length === 0) {
      if (
        node.data.startDate === null &&
        node.data.dueDate === null &&
        node.data.estimatedHours === null
      ) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          startDate: null,
          dueDate: null,
          estimatedHours: null,
        },
      };
    }

    const starts = children
      .map((c) => c.startDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    const dues = children
      .map((c) => c.dueDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    const totalHours = children.reduce(
      (sum, c) => sum + (c.estimatedHours !== null ? Number(c.estimatedHours) || 0 : 0),
      0,
    );

    const minStart = starts.length > 0 ? starts[0] : null;
    const maxDue = dues.length > 0 ? dues[dues.length - 1] : null;

    if (
      node.data.startDate === minStart &&
      node.data.dueDate === maxDue &&
      node.data.estimatedHours === totalHours
    ) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        startDate: minStart,
        dueDate: maxDue,
        estimatedHours: totalHours,
      },
    };
  });
}
