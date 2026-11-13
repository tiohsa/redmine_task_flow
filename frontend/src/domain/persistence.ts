import type {
  BootstrapData,
  TaskFlowEdge,
  TaskFlowNode,
} from '../types/flow';

export interface SerializedFlowData {
  schema_version: 1;
  baseDate: string;
  nodes: TaskFlowNode[];
  edges: TaskFlowEdge[];
}

export interface ImportResult {
  ok: boolean;
  data?: SerializedFlowData;
  warnings: string[];
  error?: string;
}

export function getDraftStorageKey(
  projectId: number | string,
  userId: number | string,
): string {
  return `task_flow_draft_v1_${projectId}_${userId}`;
}

export function saveDraftToStorage(
  projectId: number | string,
  userId: number | string,
  payload: SerializedFlowData,
): { ok: boolean; error?: string } {
  try {
    const key = getDraftStorageKey(projectId, userId);
    window.localStorage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'localStorage save failed';
    return {
      ok: false,
      error: message,
    };
  }
}

export function loadDraftFromStorage(
  projectId: number | string,
  userId: number | string,
): string | null {
  try {
    const key = getDraftStorageKey(projectId, userId);
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function clearDraftFromStorage(
  projectId: number | string,
  userId: number | string,
): void {
  try {
    const key = getDraftStorageKey(projectId, userId);
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export function serializeFlowJson(
  nodes: TaskFlowNode[],
  edges: TaskFlowEdge[],
  baseDate: string,
): string {
  const payload: SerializedFlowData = {
    schema_version: 1,
    baseDate,
    nodes: nodes.map((n) => ({
      ...n,
      selected: false,
      data: {
        ...n.data,
        createdIssueId: null,
      },
    })),
    edges: edges.map((e) => ({
      ...e,
      selected: false,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and validates serialized flow JSON, falling back invalid IDs
 * (tracker, status, priority, assignee, version, custom fields) against
 * the current project's bootstrap metadata and collecting warnings.
 */
export function parseAndSanitizeFlowJson(
  rawJson: string,
  bootstrap: BootstrapData | null,
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      warnings: [],
      error: 'JSON の形式が正しくありません',
    };
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as Record<string, unknown>).schema_version !== 1 ||
    !Array.isArray((parsed as Record<string, unknown>).nodes) ||
    !Array.isArray((parsed as Record<string, unknown>).edges)
  ) {
    return {
      ok: false,
      warnings: [],
      error: 'タスクフロー形式（schema_version: 1, nodes, edges）ではありません',
    };
  }

  const record = parsed as SerializedFlowData;
  const warnings: string[] = [];
  const warningSet = new Set<string>();
  const addWarning = (msg: string) => {
    if (!warningSet.has(msg)) {
      warningSet.add(msg);
      warnings.push(msg);
    }
  };

  const defaultTracker = bootstrap?.trackers[0];
  const defaultPriority =
    bootstrap?.priorities.find((p) => p.is_default) ?? bootstrap?.priorities[0];
  const defaultStatus =
    bootstrap?.statuses.find((s) => s.is_default) ?? bootstrap?.statuses[0];

  const validTrackerMap = new Map(
    (bootstrap?.trackers ?? []).map((t) => [t.id, t]),
  );
  const validUserIds = new Set(
    (bootstrap?.assignable_users ?? []).map((u) => u.id),
  );
  const validVersionIds = new Set(
    (bootstrap?.versions ?? []).map((v) => v.id),
  );

  const sanitizedNodes: TaskFlowNode[] = [];
  const rawNodes = record.nodes;

  for (const raw of rawNodes) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.data) continue;
    const nodeType = raw.type === 'groupNode' ? 'groupNode' : 'taskNode';
    const d = { ...raw.data };

    if (bootstrap) {
      let tracker = validTrackerMap.get(Number(d.trackerId));
      if (!tracker && defaultTracker) {
        addWarning(
          `プロジェクトに存在しないトラッカー (ID: ${d.trackerId}) をデフォルト「${defaultTracker.name}」へフォールバックしました`,
        );
        tracker = defaultTracker;
        d.trackerId = defaultTracker.id;
      }

      if (tracker) {
        const allowedStatuses = new Set(tracker.allowed_status_ids);
        if (!allowedStatuses.has(Number(d.statusId))) {
          const fallbackStatusId =
            tracker.default_status_id ?? defaultStatus?.id ?? d.statusId;
          addWarning(
            `トラッカー「${tracker.name}」で許可されていないステータス (ID: ${d.statusId}) を初期ステータスへフォールバックしました`,
          );
          d.statusId = fallbackStatusId;
        }
      }

      const validPriorityIds = new Set(bootstrap.priorities.map((p) => p.id));
      if (!validPriorityIds.has(Number(d.priorityId)) && defaultPriority) {
        addWarning(
          `存在しない優先度 (ID: ${d.priorityId}) を「${defaultPriority.name}」へフォールバックしました`,
        );
        d.priorityId = defaultPriority.id;
      }

      if (d.assignedToId !== null && d.assignedToId !== undefined) {
        if (!validUserIds.has(Number(d.assignedToId))) {
          addWarning(
            `プロジェクトに所属しない担当者 (ID: ${d.assignedToId}) を未割当へリセットしました`,
          );
          d.assignedToId = null;
        }
      }

      if (d.fixedVersionId !== null && d.fixedVersionId !== undefined) {
        if (!validVersionIds.has(Number(d.fixedVersionId))) {
          addWarning(
            `プロジェクトに存在しない対象バージョン (ID: ${d.fixedVersionId}) を未設定へリセットしました`,
          );
          d.fixedVersionId = null;
        }
      }

      if (tracker && d.customFieldValues && typeof d.customFieldValues === 'object') {
        const validCfIds = new Set(tracker.custom_fields.map((cf) => String(cf.id)));
        const nextCfValues: Record<string, string> = {};
        for (const [cfId, cfVal] of Object.entries(d.customFieldValues)) {
          if (validCfIds.has(cfId)) {
            nextCfValues[cfId] = String(cfVal ?? '');
          } else {
            addWarning(
              `対象トラッカーで無効なカスタムフィールド (ID: ${cfId}) を除外しました`,
            );
          }
        }
        d.customFieldValues = nextCfValues;
      }
    }

    sanitizedNodes.push({
      ...raw,
      type: nodeType,
      selected: false,
      parentId: nodeType === 'groupNode' ? undefined : raw.parentId,
      data: {
        ...d,
        createdIssueId: null,
      },
    });
  }

  // Ensure groupNodes always precede taskNodes
  const groups = sanitizedNodes.filter((n) => n.type === 'groupNode');
  const tasks = sanitizedNodes.filter((n) => n.type === 'taskNode');
  const orderedNodes = [...groups, ...tasks];

  const nodeIdSet = new Set(orderedNodes.map((n) => n.id));
  const sanitizedEdges: TaskFlowEdge[] = record.edges
    .filter(
      (e) =>
        e &&
        typeof e === 'object' &&
        nodeIdSet.has(e.source) &&
        nodeIdSet.has(e.target),
    )
    .map((e) => ({
      ...e,
      type: 'dependencyEdge',
      selected: false,
      data: {
        delay: Math.max(0, Math.min(60, Number(e.data?.delay ?? 0) || 0)),
      },
    }));

  return {
    ok: true,
    warnings,
    data: {
      schema_version: 1,
      baseDate:
        typeof record.baseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.baseDate)
          ? record.baseDate
          : '',
      nodes: orderedNodes,
      edges: sanitizedEdges,
    },
  };
}
