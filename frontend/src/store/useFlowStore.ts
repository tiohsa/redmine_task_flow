import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import type {
  BootstrapData,
  BulkCreateRequestPayload,
  CreatedIssueResult,
  FlowSnapshot,
  TaskFlowEdge,
  TaskFlowNode,
  TaskNodeData,
  ToastMessage,
} from '../types/flow';
import { validateConnection } from '../domain/graphValidation';
import { propagateDates, todayYmd } from '../domain/datePropagation';
import {
  computeAutoLayout,
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  TASK_NODE_HEIGHT,
  TASK_NODE_WIDTH,
} from '../domain/autoLayout';
import { validateNodeAttributes } from '../domain/nodeValidation';
import {
  clearDraftFromStorage,
  loadDraftFromStorage,
  parseAndSanitizeFlowJson,
  saveDraftToStorage,
  serializeFlowJson,
} from '../domain/persistence';
import { generateId } from '../domain/uuid';
import { postBulkCreate, SessionExpiredError } from '../api/client';

const MAX_HISTORY = 50;

export function normalizeNodesOrder(nodes: TaskFlowNode[]): TaskFlowNode[] {
  const groups = nodes.filter((n) => n.type === 'groupNode');
  const tasks = nodes.filter((n) => n.type === 'taskNode');
  return [...groups, ...tasks];
}

function getDefaultNodeData(
  bootstrap: BootstrapData | null,
  subject = '新規タスク',
): TaskNodeData {
  const defaultTracker = bootstrap?.trackers[0];
  const defaultStatus =
    bootstrap?.statuses.find((s) => s.is_default) ?? bootstrap?.statuses[0];
  const defaultPriority =
    bootstrap?.priorities.find((p) => p.is_default) ?? bootstrap?.priorities[0];

  return {
    subject,
    trackerId: defaultTracker?.id ?? 1,
    statusId: defaultTracker?.default_status_id ?? defaultStatus?.id ?? 1,
    priorityId: defaultPriority?.id ?? 2,
    assignedToId: null,
    fixedVersionId: null,
    estimatedHours: 8,
    startDate: null,
    dueDate: null,
    lockDates: false,
    description: '',
    customFieldValues: {},
    createdIssueId: null,
  };
}

function createSampleFlow(
  bootstrap: BootstrapData | null,
  baseDate: string,
): { nodes: TaskFlowNode[]; edges: TaskFlowEdge[] } {
  const t1 = bootstrap?.trackers[0];
  const t2 = bootstrap?.trackers[1] ?? t1;
  const t3 = bootstrap?.trackers[2] ?? t1;
  const defaultPriority =
    bootstrap?.priorities.find((p) => p.is_default)?.id ??
    bootstrap?.priorities[0]?.id ??
    2;
  const firstUser = bootstrap?.assignable_users[0]?.id ?? null;
  const firstVersion = bootstrap?.versions[0]?.id ?? null;

  const groupId = 'group_sample_1';
  const n1Id = 'task_sample_1';
  const n2Id = 'task_sample_2';
  const n3Id = 'task_sample_3';
  const n4Id = 'task_sample_4';

  const makeCfDefaults = (tracker: typeof t1): Record<string, string> => {
    const cfValues: Record<string, string> = {};
    if (tracker) {
      for (const cf of tracker.custom_fields) {
        if (cf.is_required && cf.possible_values && cf.possible_values.length > 0) {
          cfValues[String(cf.id)] = cf.possible_values[0];
        }
      }
    }
    return cfValues;
  };

  const groupNode: TaskFlowNode = {
    id: groupId,
    type: 'groupNode',
    position: { x: 400, y: 60 },
    width: 680,
    height: 300,
    style: { width: 680, height: 300 },
    data: {
      ...getDefaultNodeData(bootstrap, '機能実装フェーズ'),
      estimatedHours: null,
    },
  };

  const n1: TaskFlowNode = {
    id: n1Id,
    type: 'taskNode',
    position: { x: 60, y: 120 },
    data: {
      ...getDefaultNodeData(bootstrap, '要件定義・設計'),
      trackerId: t1?.id ?? 1,
      statusId: t1?.default_status_id ?? 1,
      priorityId: defaultPriority,
      assignedToId: firstUser,
      fixedVersionId: firstVersion,
      estimatedHours: 8,
      customFieldValues: makeCfDefaults(t1),
    },
  };

  const n2: TaskFlowNode = {
    id: n2Id,
    type: 'taskNode',
    parentId: groupId,
    position: { x: 30, y: 56 },
    data: {
      ...getDefaultNodeData(bootstrap, 'バックエンドAPI実装'),
      trackerId: t2?.id ?? 1,
      statusId: t2?.default_status_id ?? 1,
      priorityId: defaultPriority,
      assignedToId: firstUser,
      fixedVersionId: firstVersion,
      estimatedHours: 16,
      customFieldValues: makeCfDefaults(t2),
    },
  };

  const n3: TaskFlowNode = {
    id: n3Id,
    type: 'taskNode',
    parentId: groupId,
    position: { x: 30, y: 180 },
    data: {
      ...getDefaultNodeData(bootstrap, 'フロントエンドUI実装'),
      trackerId: t2?.id ?? 1,
      statusId: t2?.default_status_id ?? 1,
      priorityId: defaultPriority,
      assignedToId: firstUser,
      fixedVersionId: firstVersion,
      estimatedHours: 16,
      customFieldValues: makeCfDefaults(t2),
    },
  };

  const n4: TaskFlowNode = {
    id: n4Id,
    type: 'taskNode',
    parentId: groupId,
    position: { x: 380, y: 118 },
    data: {
      ...getDefaultNodeData(bootstrap, '結合テスト・QA'),
      trackerId: t3?.id ?? 1,
      statusId: t3?.default_status_id ?? 1,
      priorityId: defaultPriority,
      assignedToId: firstUser,
      fixedVersionId: null,
      estimatedHours: 8,
      customFieldValues: makeCfDefaults(t3),
    },
  };

  const edges: TaskFlowEdge[] = [
    {
      id: 'edge_sample_1',
      source: n1Id,
      target: n2Id,
      type: 'dependencyEdge',
      data: { delay: 0 },
    },
    {
      id: 'edge_sample_2',
      source: n1Id,
      target: n3Id,
      type: 'dependencyEdge',
      data: { delay: 0 },
    },
    {
      id: 'edge_sample_3',
      source: n2Id,
      target: n4Id,
      type: 'dependencyEdge',
      data: { delay: 0 },
    },
    {
      id: 'edge_sample_4',
      source: n3Id,
      target: n4Id,
      type: 'dependencyEdge',
      data: { delay: 0 },
    },
  ];

  const nodes = propagateDates([groupNode, n1, n2, n3, n4], edges, baseDate);
  return { nodes, edges };
}

function getAbsolutePosition(
  node: TaskFlowNode,
  nodeMap: Map<string, TaskFlowNode>,
): XYPosition {
  if (node.parentId) {
    const parent = nodeMap.get(node.parentId);
    if (parent) {
      return {
        x: parent.position.x + node.position.x,
        y: parent.position.y + node.position.y,
      };
    }
  }
  return { ...node.position };
}

export interface FlowStoreState {
  bootstrap: BootstrapData | null;
  bulkCreateUrl: string;
  projectIdentifier: string;

  nodes: TaskFlowNode[];
  edges: TaskFlowEdge[];
  baseDate: string;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  past: FlowSnapshot[];
  future: FlowSnapshot[];

  validationErrors: Record<string, string[]>;
  createdIssuesMap: Record<string, CreatedIssueResult>;
  isSubmitted: boolean;
  isSubmitting: boolean;
  resultModalOpen: boolean;
  resultModalMode: 'success' | 'error' | null;
  submitErrorMessages: string[];

  toasts: ToastMessage[];
  focusSubjectSeq: number;
  isInspectorCollapsed: boolean;

  // Initialization & toast helpers
  initialize: (
    bootstrap: BootstrapData,
    bulkCreateUrl: string,
  ) => void;
  setBootstrapForTest: (bootstrap: BootstrapData | null) => void;
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;

  // Selection & Inspector UI
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  triggerFocusSubject: () => void;
  toggleInspectorCollapsed: () => void;
  setInspectorCollapsed: (collapsed: boolean) => void;

  // React Flow controlled handlers
  onNodesChange: (changes: NodeChange<TaskFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<TaskFlowEdge>[]) => void;
  pushSnapshot: (snapshot?: FlowSnapshot) => void;

  // Graph actions
  addTaskNode: (options?: {
    sourceNodeId?: string;
    siblingOfNodeId?: string;
    position?: XYPosition;
  }) => string;
  addGroupNode: (position?: XYPosition) => string;
  deleteSelected: () => void;
  detachFromGroup: (nodeId: string) => void;
  assignNodeToGroup: (nodeId: string, groupId: string | null) => void;
  connectNodes: (connection: Connection) => { ok: boolean; reason?: string };
  updateNodeData: (
    nodeId: string,
    patch: Partial<TaskNodeData>,
    options?: { recordHistory?: boolean },
  ) => void;
  updateEdgeDelay: (edgeId: string, delay: number) => void;
  setBaseDate: (date: string) => void;
  recalculateDates: () => void;
  applyAutoLayout: () => void;

  // Submission & persistence
  submitBulkCreate: () => Promise<void>;
  closeResultModal: () => void;
  resetFlow: () => void;
  resetToSample: () => void;
  exportJson: () => string;
  importJson: (rawJson: string) => {
    ok: boolean;
    warnings: string[];
    error?: string;
  };
  undo: () => void;
  redo: () => void;
}

function persistDraftIfReady(state: FlowStoreState): void {
  if (!state.bootstrap || state.isSubmitted) return;
  saveDraftToStorage(state.bootstrap.project.id, state.bootstrap.current_user_id, {
    schema_version: 1,
    baseDate: state.baseDate,
    nodes: state.nodes,
    edges: state.edges,
  });
}

export const useFlowStore = create<FlowStoreState>((set, get) => ({
  bootstrap: null,
  bulkCreateUrl: '',
  projectIdentifier: '',

  nodes: [],
  edges: [],
  baseDate: todayYmd(),
  selectedNodeId: null,
  selectedEdgeId: null,

  past: [],
  future: [],

  validationErrors: {},
  createdIssuesMap: {},
  isSubmitted: false,
  isSubmitting: false,
  resultModalOpen: false,
  resultModalMode: null,
  submitErrorMessages: [],

  toasts: [],
  focusSubjectSeq: 0,
  isInspectorCollapsed: false,

  initialize: (bootstrap, bulkCreateUrl) => {
    const baseDate = todayYmd();
    const rawDraft = loadDraftFromStorage(
      bootstrap.project.id,
      bootstrap.current_user_id,
    );

    if (rawDraft) {
      const imported = parseAndSanitizeFlowJson(rawDraft, bootstrap);
      if (imported.ok && imported.data && imported.data.nodes.length > 0) {
        const effectiveBaseDate = imported.data.baseDate || baseDate;
        const nodes = propagateDates(
          normalizeNodesOrder(imported.data.nodes),
          imported.data.edges,
          effectiveBaseDate,
        );
        set({
          bootstrap,
          bulkCreateUrl,
          projectIdentifier: bootstrap.project.identifier,
          nodes,
          edges: imported.data.edges,
          baseDate: effectiveBaseDate,
          selectedNodeId: null,
          selectedEdgeId: null,
          past: [],
          future: [],
          validationErrors: {},
          createdIssuesMap: {},
          isSubmitted: false,
        });
        for (const w of imported.warnings) {
          get().addToast('warning', w);
        }
        get().addToast('info', '前回の下書きを復元しました');
        return;
      }
    }

    const sample = createSampleFlow(bootstrap, baseDate);
    set({
      bootstrap,
      bulkCreateUrl,
      projectIdentifier: bootstrap.project.identifier,
      nodes: normalizeNodesOrder(sample.nodes),
      edges: sample.edges,
      baseDate,
      selectedNodeId: null,
      selectedEdgeId: null,
      past: [],
      future: [],
      validationErrors: {},
      createdIssuesMap: {},
      isSubmitted: false,
    });
  },

  setBootstrapForTest: (bootstrap) => {
    set({ bootstrap });
  },

  addToast: (type, message) => {
    const id = generateId('toast');
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        get().removeToast(id);
      }, 4500);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  selectNode: (nodeId) => {
    set((state) => ({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
      edges: state.edges.map((e) => ({
        ...e,
        selected: false,
      })),
    }));
  },

  selectEdge: (edgeId) => {
    set((state) => ({
      selectedNodeId: null,
      selectedEdgeId: edgeId,
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: false,
      })),
      edges: state.edges.map((e) => ({
        ...e,
        selected: e.id === edgeId,
      })),
    }));
  },

  clearSelection: () => {
    set((state) => ({
      selectedNodeId: null,
      selectedEdgeId: null,
      nodes: state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      edges: state.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    }));
  },

  triggerFocusSubject: () => {
    set((state) => ({
      focusSubjectSeq: state.focusSubjectSeq + 1,
      isInspectorCollapsed: false,
    }));
  },

  toggleInspectorCollapsed: () => {
    set((state) => ({ isInspectorCollapsed: !state.isInspectorCollapsed }));
  },

  setInspectorCollapsed: (collapsed) => {
    set({ isInspectorCollapsed: collapsed });
  },

  pushSnapshot: (snapshot) => {
    set((state) => {
      const snap: FlowSnapshot = snapshot ?? {
        nodes: state.nodes,
        edges: state.edges,
        baseDate: state.baseDate,
      };
      const nextPast = [...state.past, snap].slice(-MAX_HISTORY);
      return { past: nextPast, future: [] };
    });
  },

  onNodesChange: (changes) => {
    set((state) => {
      const updated = applyNodeChanges(changes, state.nodes);
      // Sync single selection from React Flow selection changes
      let nextSelectedNodeId = state.selectedNodeId;
      let nextSelectedEdgeId = state.selectedEdgeId;
      for (const ch of changes) {
        if (ch.type === 'select') {
          if (ch.selected) {
            nextSelectedNodeId = ch.id;
            nextSelectedEdgeId = null;
          } else if (nextSelectedNodeId === ch.id) {
            nextSelectedNodeId = null;
          }
        }
      }
      const normalized = normalizeNodesOrder(updated);
      return {
        nodes: normalized,
        selectedNodeId: nextSelectedNodeId,
        selectedEdgeId: nextSelectedEdgeId,
      };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const updated = applyEdgeChanges(changes, state.edges);
      let nextSelectedEdgeId = state.selectedEdgeId;
      let nextSelectedNodeId = state.selectedNodeId;
      for (const ch of changes) {
        if (ch.type === 'select') {
          if (ch.selected) {
            nextSelectedEdgeId = ch.id;
            nextSelectedNodeId = null;
          } else if (nextSelectedEdgeId === ch.id) {
            nextSelectedEdgeId = null;
          }
        }
      }
      return {
        edges: updated,
        selectedEdgeId: nextSelectedEdgeId,
        selectedNodeId: nextSelectedNodeId,
      };
    });
  },

  addTaskNode: (options) => {
    const state = get();
    if (state.isSubmitted) {
      state.addToast(
        'warning',
        '登録完了後は編集できません。「新規フローとしてリセット」を実行してください',
      );
      return '';
    }

    const newId = generateId('task');
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

    let data = getDefaultNodeData(state.bootstrap, '新規タスク');
    let position: XYPosition = options?.position ?? { x: 160, y: 160 };
    const newEdges = [...state.edges];

    if (options?.sourceNodeId) {
      const src = nodeMap.get(options.sourceNodeId);
      if (src) {
        const abs = getAbsolutePosition(src, nodeMap);
        position = { x: abs.x + TASK_NODE_WIDTH + 90, y: abs.y };
        const tracker = state.bootstrap?.trackers.find(
          (t) => t.id === src.data.trackerId,
        );
        data = {
          ...data,
          subject: '後続タスク',
          trackerId: src.data.trackerId,
          statusId: tracker?.default_status_id ?? src.data.statusId,
          priorityId: src.data.priorityId,
          assignedToId: src.data.assignedToId,
          fixedVersionId: src.data.fixedVersionId,
          customFieldValues: { ...src.data.customFieldValues },
        };
        newEdges.push({
          id: generateId('edge'),
          source: src.id,
          target: newId,
          type: 'dependencyEdge',
          data: { delay: 0 },
        });
      }
    } else if (options?.siblingOfNodeId) {
      const sib = nodeMap.get(options.siblingOfNodeId);
      if (sib) {
        const abs = getAbsolutePosition(sib, nodeMap);
        position = { x: abs.x, y: abs.y + TASK_NODE_HEIGHT + 40 };
        const tracker = state.bootstrap?.trackers.find(
          (t) => t.id === sib.data.trackerId,
        );
        data = {
          ...data,
          subject: '並列タスク',
          trackerId: sib.data.trackerId,
          statusId: tracker?.default_status_id ?? sib.data.statusId,
          priorityId: sib.data.priorityId,
          assignedToId: sib.data.assignedToId,
          fixedVersionId: sib.data.fixedVersionId,
          customFieldValues: { ...sib.data.customFieldValues },
        };
        const incomingEdges = state.edges.filter(
          (e) => e.target === sib.id,
        );
        for (const inc of incomingEdges) {
          newEdges.push({
            id: generateId('edge'),
            source: inc.source,
            target: newId,
            type: 'dependencyEdge',
            data: { delay: 0 },
          });
        }
      }
    } else if (!options?.position) {
      const taskCount = state.nodes.filter((n) => n.type === 'taskNode').length;
      position = {
        x: 120 + (taskCount % 4) * 40,
        y: 120 + (taskCount % 4) * 40,
      };
    }

    const newNode: TaskFlowNode = {
      id: newId,
      type: 'taskNode',
      position,
      selected: true,
      data,
    };

    state.pushSnapshot();
    const nextNodes = propagateDates(
      normalizeNodesOrder([
        ...state.nodes.map((n) => ({ ...n, selected: false })),
        newNode,
      ]),
      newEdges,
      state.baseDate,
    );

    set((prev) => ({
      nodes: nextNodes,
      edges: newEdges.map((e) => ({ ...e, selected: false })),
      selectedNodeId: newId,
      selectedEdgeId: null,
      focusSubjectSeq: prev.focusSubjectSeq + 1,
      isInspectorCollapsed: false,
    }));
    persistDraftIfReady(get());
    return newId;
  },

  addGroupNode: (position) => {
    const state = get();
    if (state.isSubmitted) {
      state.addToast(
        'warning',
        '登録完了後は編集できません。「新規フローとしてリセット」を実行してください',
      );
      return '';
    }

    const newId = generateId('group');
    const groupCount = state.nodes.filter((n) => n.type === 'groupNode').length;
    const pos: XYPosition = position ?? {
      x: 100 + groupCount * 40,
      y: 80 + groupCount * 40,
    };

    const newGroup: TaskFlowNode = {
      id: newId,
      type: 'groupNode',
      position: pos,
      width: DEFAULT_GROUP_WIDTH,
      height: DEFAULT_GROUP_HEIGHT,
      style: { width: DEFAULT_GROUP_WIDTH, height: DEFAULT_GROUP_HEIGHT },
      selected: true,
      data: {
        ...getDefaultNodeData(state.bootstrap, '親チケットグループ'),
        estimatedHours: null,
        startDate: null,
        dueDate: null,
      },
    };

    state.pushSnapshot();
    const nextNodes = propagateDates(
      normalizeNodesOrder([
        ...state.nodes.map((n) => ({ ...n, selected: false })),
        newGroup,
      ]),
      state.edges,
      state.baseDate,
    );

    set((prev) => ({
      nodes: nextNodes,
      edges: state.edges.map((e) => ({ ...e, selected: false })),
      selectedNodeId: newId,
      selectedEdgeId: null,
      focusSubjectSeq: prev.focusSubjectSeq + 1,
      isInspectorCollapsed: false,
    }));
    persistDraftIfReady(get());
    return newId;
  },

  deleteSelected: () => {
    const state = get();
    if (state.isSubmitted) return;

    if (state.selectedEdgeId) {
      state.pushSnapshot();
      const nextEdges = state.edges.filter(
        (e) => e.id !== state.selectedEdgeId,
      );
      const nextNodes = propagateDates(state.nodes, nextEdges, state.baseDate);
      set({
        nodes: nextNodes,
        edges: nextEdges,
        selectedEdgeId: null,
      });
      persistDraftIfReady(get());
      return;
    }

    if (state.selectedNodeId) {
      const target = state.nodes.find((n) => n.id === state.selectedNodeId);
      if (!target) return;

      state.pushSnapshot();

      if (target.type === 'groupNode') {
        // Detach children without deleting them; convert relative -> absolute position
        const nextNodes = state.nodes
          .filter((n) => n.id !== target.id)
          .map((n) => {
            if (n.parentId === target.id) {
              return {
                ...n,
                parentId: undefined,
                position: {
                  x: target.position.x + n.position.x,
                  y: target.position.y + n.position.y,
                },
              };
            }
            return n;
          });
        set({
          nodes: propagateDates(
            normalizeNodesOrder(nextNodes),
            state.edges,
            state.baseDate,
          ),
          selectedNodeId: null,
        });
      } else {
        const nextNodes = state.nodes.filter((n) => n.id !== target.id);
        const nextEdges = state.edges.filter(
          (e) => e.source !== target.id && e.target !== target.id,
        );
        set({
          nodes: propagateDates(
            normalizeNodesOrder(nextNodes),
            nextEdges,
            state.baseDate,
          ),
          edges: nextEdges,
          selectedNodeId: null,
        });
      }
      persistDraftIfReady(get());
    }
  },

  detachFromGroup: (nodeId) => {
    const state = get();
    if (state.isSubmitted) return;
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node || !node.parentId) return;
    const parent = state.nodes.find((n) => n.id === node.parentId);

    state.pushSnapshot();
    const nextNodes = state.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        parentId: undefined,
        position: parent
          ? {
              x: parent.position.x + n.position.x,
              y: parent.position.y + n.position.y,
            }
          : n.position,
      };
    });

    set({
      nodes: propagateDates(
        normalizeNodesOrder(nextNodes),
        state.edges,
        state.baseDate,
      ),
    });
    persistDraftIfReady(get());
  },

  assignNodeToGroup: (nodeId, groupId) => {
    const state = get();
    if (state.isSubmitted) return;
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'taskNode') return;

    const currentParentId = node.parentId ?? null;
    if (currentParentId === groupId) return;

    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const absPos = getAbsolutePosition(node, nodeMap);
    const nextParent = groupId ? nodeMap.get(groupId) : undefined;
    if (groupId && (!nextParent || nextParent.type !== 'groupNode')) return;

    const nextPosition: XYPosition = nextParent
      ? {
          x: absPos.x - nextParent.position.x,
          y: absPos.y - nextParent.position.y,
        }
      : absPos;

    const nextNodes = state.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            parentId: groupId ?? undefined,
            position: nextPosition,
          }
        : n,
    );

    set({
      nodes: propagateDates(
        normalizeNodesOrder(nextNodes),
        state.edges,
        state.baseDate,
      ),
    });
    persistDraftIfReady(get());
  },

  connectNodes: (connection) => {
    const state = get();
    if (state.isSubmitted) {
      const reason = '登録完了後は接続を変更できません';
      state.addToast('warning', reason);
      return { ok: false, reason };
    }

    const validation = validateConnection(
      connection.source,
      connection.target,
      state.nodes,
      state.edges,
    );

    if (!validation.ok) {
      state.addToast('warning', validation.reason ?? '接続できません');
      return validation;
    }

    state.pushSnapshot();
    const newEdge: TaskFlowEdge = {
      id: generateId('edge'),
      source: connection.source!,
      target: connection.target!,
      type: 'dependencyEdge',
      data: { delay: 0 },
    };
    const nextEdges = [...state.edges, newEdge];
    const nextNodes = propagateDates(state.nodes, nextEdges, state.baseDate);

    set({
      nodes: nextNodes,
      edges: nextEdges,
    });
    persistDraftIfReady(get());
    return { ok: true };
  },

  updateNodeData: (nodeId, patch, options) => {
    const state = get();
    if (state.isSubmitted) return;

    const recordHistory = options?.recordHistory ?? true;
    const targetNode = state.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const mergedPatch: Partial<TaskNodeData> = { ...patch };

    // Auto-lock dates when startDate or dueDate is manually edited
    if (
      (patch.startDate !== undefined || patch.dueDate !== undefined) &&
      patch.lockDates === undefined
    ) {
      mergedPatch.lockDates = true;
    }

    // Tracker change -> ensure statusId is allowed for the new tracker
    if (patch.trackerId !== undefined && state.bootstrap) {
      const tracker = state.bootstrap.trackers.find(
        (t) => t.id === Number(patch.trackerId),
      );
      if (tracker) {
        const currentStatusId = patch.statusId ?? targetNode.data.statusId;
        if (!tracker.allowed_status_ids.includes(Number(currentStatusId))) {
          mergedPatch.statusId = tracker.default_status_id;
        }
      }
    }

    if (recordHistory) {
      state.pushSnapshot();
    }

    const updatedNodes = state.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...mergedPatch } } : n,
    );

    const nextNodes = propagateDates(
      updatedNodes,
      state.edges,
      state.baseDate,
    );

    // Clear stale validation error on this node if edited
    const nextErrors = { ...state.validationErrors };
    delete nextErrors[nodeId];

    set({
      nodes: nextNodes,
      validationErrors: nextErrors,
    });
    persistDraftIfReady(get());
  },

  updateEdgeDelay: (edgeId, delay) => {
    const state = get();
    if (state.isSubmitted) return;

    const clamped = Number.isFinite(delay)
      ? Math.max(0, Math.min(60, Math.trunc(delay)))
      : 0;

    state.pushSnapshot();
    const nextEdges = state.edges.map((e) =>
      e.id === edgeId ? { ...e, data: { ...e.data, delay: clamped } } : e,
    );
    const nextNodes = propagateDates(state.nodes, nextEdges, state.baseDate);

    set({
      nodes: nextNodes,
      edges: nextEdges,
    });
    persistDraftIfReady(get());
  },

  setBaseDate: (date) => {
    const state = get();
    if (state.isSubmitted) return;
    state.pushSnapshot();
    const nextNodes = propagateDates(state.nodes, state.edges, date);
    set({
      baseDate: date,
      nodes: nextNodes,
    });
    persistDraftIfReady(get());
  },

  recalculateDates: () => {
    const state = get();
    if (state.isSubmitted) return;
    state.pushSnapshot();
    const nextNodes = propagateDates(state.nodes, state.edges, state.baseDate);
    set({ nodes: nextNodes });
    persistDraftIfReady(get());
    state.addToast('info', '日程を自動再計算しました');
  },

  applyAutoLayout: () => {
    const state = get();
    if (state.isSubmitted) return;
    state.pushSnapshot();
    const nextNodes = computeAutoLayout(state.nodes, state.edges);
    set({ nodes: nextNodes });
    persistDraftIfReady(get());
  },

  submitBulkCreate: async () => {
    const state = get();
    if (state.isSubmitting || state.isSubmitted) return;

    if (state.nodes.length === 0) {
      state.addToast('warning', '登録するタスクノードがありません');
      return;
    }

    // Pre-submit client validation
    const errorsMap: Record<string, string[]> = {};
    let firstErrorNodeId: string | null = null;
    for (const node of state.nodes) {
      const errs = validateNodeAttributes(node, state.bootstrap);
      if (errs.length > 0) {
        errorsMap[node.id] = errs;
        if (!firstErrorNodeId) firstErrorNodeId = node.id;
      }
    }

    if (firstErrorNodeId) {
      set({ validationErrors: errorsMap });
      state.selectNode(firstErrorNodeId);
      state.addToast(
        'error',
        '入力エラーのあるノードがあります。右側のインスペクタを確認してください',
      );
      return;
    }

    set({ isSubmitting: true, validationErrors: {}, submitErrorMessages: [] });

    const payload: BulkCreateRequestPayload = {
      issues: state.nodes.map((n) => {
        const isGroup = n.type === 'groupNode';
        return {
          temp_id: n.id,
          parent_temp_id: isGroup ? null : n.parentId ?? null,
          is_group: isGroup,
          tracker_id: Number(n.data.trackerId),
          subject: n.data.subject,
          status_id: Number(n.data.statusId),
          priority_id: Number(n.data.priorityId),
          assigned_to_id:
            n.data.assignedToId !== null ? Number(n.data.assignedToId) : null,
          fixed_version_id:
            n.data.fixedVersionId !== null
              ? Number(n.data.fixedVersionId)
              : null,
          estimated_hours: isGroup ? null : n.data.estimatedHours,
          start_date: isGroup ? null : n.data.startDate,
          due_date: isGroup ? null : n.data.dueDate,
          custom_field_values: n.data.customFieldValues ?? {},
          description: n.data.description ?? '',
        };
      }),
      relations: state.edges.map((e) => ({
        source_temp_id: e.source,
        target_temp_id: e.target,
        relation_type: 'precedes',
        delay: Number(e.data?.delay ?? 0) || 0,
      })),
    };

    try {
      const result = await postBulkCreate(state.bulkCreateUrl, payload);

      if (result.ok) {
        const createdMap: Record<string, CreatedIssueResult> = {};
        for (const item of result.data.issues) {
          createdMap[item.temp_id] = {
            id: item.id,
            startDate: item.start_date,
            dueDate: item.due_date,
          };
        }

        const syncedNodes = state.nodes.map((n) => {
          const created = createdMap[n.id];
          if (!created) return n;
          return {
            ...n,
            data: {
              ...n.data,
              createdIssueId: created.id,
              startDate: created.startDate,
              dueDate: created.dueDate,
            },
          };
        });

        if (state.bootstrap) {
          clearDraftFromStorage(
            state.bootstrap.project.id,
            state.bootstrap.current_user_id,
          );
        }

        set({
          nodes: syncedNodes,
          createdIssuesMap: createdMap,
          isSubmitted: true,
          isSubmitting: false,
          resultModalOpen: true,
          resultModalMode: 'success',
        });
        state.addToast(
          'success',
          `${result.data.issues.length}件のチケットを一括登録しました`,
        );
      } else {
        const serverErrors: Record<string, string[]> = {};
        const globalMessages: string[] = [];
        let firstErrId: string | null = null;
        for (const err of result.data.errors) {
          if (err.temp_id) {
            serverErrors[err.temp_id] = err.messages;
            if (!firstErrId) firstErrId = err.temp_id;
          } else {
            globalMessages.push(...err.messages);
          }
        }
        set({
          validationErrors: serverErrors,
          submitErrorMessages: globalMessages,
          isSubmitting: false,
          resultModalOpen: true,
          resultModalMode: 'error',
        });
        if (firstErrId) {
          state.selectNode(firstErrId);
        }
        state.addToast('error', '一括登録でバリデーションエラーが発生しました');
      }
    } catch (err) {
      set({ isSubmitting: false });
      if (err instanceof SessionExpiredError) {
        state.addToast('error', err.message);
      } else {
        state.addToast(
          'error',
          err instanceof Error ? err.message : '通信エラーが発生しました',
        );
      }
    }
  },

  closeResultModal: () => {
    set({ resultModalOpen: false });
  },

  resetFlow: () => {
    const state = get();
    if (state.bootstrap) {
      clearDraftFromStorage(
        state.bootstrap.project.id,
        state.bootstrap.current_user_id,
      );
    }
    const baseDate = todayYmd();
    const initialNode: TaskFlowNode = {
      id: generateId('task'),
      type: 'taskNode',
      position: { x: 120, y: 140 },
      data: getDefaultNodeData(state.bootstrap, '新規タスク'),
    };
    const nodes = propagateDates([initialNode], [], baseDate);
    set({
      nodes,
      edges: [],
      baseDate,
      selectedNodeId: null,
      selectedEdgeId: null,
      past: [],
      future: [],
      validationErrors: {},
      createdIssuesMap: {},
      isSubmitted: false,
      resultModalOpen: false,
      resultModalMode: null,
      submitErrorMessages: [],
    });
    state.addToast('info', '新規フローとしてリセットしました');
  },

  resetToSample: () => {
    const state = get();
    if (state.bootstrap) {
      clearDraftFromStorage(
        state.bootstrap.project.id,
        state.bootstrap.current_user_id,
      );
    }
    const baseDate = todayYmd();
    const sample = createSampleFlow(state.bootstrap, baseDate);
    set({
      nodes: normalizeNodesOrder(sample.nodes),
      edges: sample.edges,
      baseDate,
      selectedNodeId: null,
      selectedEdgeId: null,
      past: [],
      future: [],
      validationErrors: {},
      createdIssuesMap: {},
      isSubmitted: false,
      resultModalOpen: false,
      resultModalMode: null,
      submitErrorMessages: [],
    });
    persistDraftIfReady(get());
    state.addToast('info', 'サンプルフローへ初期化しました');
  },

  exportJson: () => {
    const state = get();
    return serializeFlowJson(state.nodes, state.edges, state.baseDate);
  },

  importJson: (rawJson) => {
    const state = get();
    const result = parseAndSanitizeFlowJson(rawJson, state.bootstrap);
    if (!result.ok || !result.data) {
      state.addToast('error', result.error ?? 'JSON の読込に失敗しました');
      return { ok: false, warnings: [], error: result.error };
    }

    state.pushSnapshot();
    const effectiveBaseDate = result.data.baseDate || state.baseDate;
    const nextNodes = propagateDates(
      normalizeNodesOrder(result.data.nodes),
      result.data.edges,
      effectiveBaseDate,
    );

    set({
      nodes: nextNodes,
      edges: result.data.edges,
      baseDate: effectiveBaseDate,
      selectedNodeId: null,
      selectedEdgeId: null,
      validationErrors: {},
      createdIssuesMap: {},
      isSubmitted: false,
    });
    persistDraftIfReady(get());

    for (const w of result.warnings) {
      state.addToast('warning', w);
    }
    state.addToast('success', 'JSON からフローを読み込みました');
    return { ok: true, warnings: result.warnings };
  },

  undo: () => {
    const state = get();
    if (state.isSubmitted || state.past.length === 0) return;

    const previous = state.past[state.past.length - 1];
    const nextPast = state.past.slice(0, -1);
    const currentSnapshot: FlowSnapshot = {
      nodes: state.nodes,
      edges: state.edges,
      baseDate: state.baseDate,
    };

    set({
      nodes: normalizeNodesOrder(previous.nodes),
      edges: previous.edges,
      baseDate: previous.baseDate,
      past: nextPast,
      future: [currentSnapshot, ...state.future].slice(0, MAX_HISTORY),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    persistDraftIfReady(get());
  },

  redo: () => {
    const state = get();
    if (state.isSubmitted || state.future.length === 0) return;

    const next = state.future[0];
    const nextFuture = state.future.slice(1);
    const currentSnapshot: FlowSnapshot = {
      nodes: state.nodes,
      edges: state.edges,
      baseDate: state.baseDate,
    };

    set({
      nodes: normalizeNodesOrder(next.nodes),
      edges: next.edges,
      baseDate: next.baseDate,
      past: [...state.past, currentSnapshot].slice(-MAX_HISTORY),
      future: nextFuture,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    persistDraftIfReady(get());
  },
}));
