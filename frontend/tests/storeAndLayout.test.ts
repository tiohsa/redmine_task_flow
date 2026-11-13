import { beforeEach, describe, expect, it } from 'vitest';
import { computeAutoLayout, TASK_NODE_HEIGHT, TASK_NODE_WIDTH } from '../src/domain/autoLayout';
import { useFlowStore } from '../src/store/useFlowStore';
import type { BootstrapData, TaskFlowEdge, TaskFlowNode } from '../src/types/flow';

const MOCK_BOOTSTRAP: BootstrapData = {
  project: { id: 12, identifier: 'ec-renewal', name: 'ECサイトリニューアル基盤' },
  trackers: [
    {
      id: 1,
      name: '機能',
      default_status_id: 1,
      allowed_status_ids: [1, 2],
      disabled_core_fields: [],
      custom_fields: [
        {
          id: 101,
          name: '対象コンポーネント',
          field_format: 'list',
          is_required: true,
          possible_values: ['フロントエンド', 'バックエンドAPI'],
        },
      ],
    },
    {
      id: 2,
      name: 'レビュー/QA',
      default_status_id: 2,
      allowed_status_ids: [2],
      disabled_core_fields: ['fixed_version_id'],
      custom_fields: [],
    },
  ],
  statuses: [
    { id: 1, name: '新規', is_default: true },
    { id: 2, name: '進行中', is_default: false },
  ],
  priorities: [
    { id: 2, name: '通常', is_default: true },
    { id: 3, name: '高め', is_default: false },
  ],
  assignable_users: [{ id: 10, name: '山田 太郎' }],
  versions: [{ id: 5, name: 'v1.0' }],
  current_user_id: 10,
};

function boxesOverlap(a: TaskFlowNode, b: TaskFlowNode): boolean {
  return !(
    a.position.x + TASK_NODE_WIDTH <= b.position.x ||
    b.position.x + TASK_NODE_WIDTH <= a.position.x ||
    a.position.y + TASK_NODE_HEIGHT <= b.position.y ||
    b.position.y + TASK_NODE_HEIGHT <= a.position.y
  );
}

describe('storeAndLayout (UT-FE-13 ~ UT-FE-16)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFlowStore.setState({
      bootstrap: MOCK_BOOTSTRAP,
      bulkCreateUrl: '/projects/ec-renewal/task_flow/bulk_create.json',
      projectIdentifier: 'ec-renewal',
      nodes: [],
      edges: [],
      baseDate: '2026-11-16',
      selectedNodeId: null,
      selectedEdgeId: null,
      past: [],
      future: [],
      validationErrors: {},
      createdIssuesMap: {},
      isSubmitted: false,
      isSubmitting: false,
    });
  });

  it('UT-FE-13: autoLayout guarantees source.x < target.x and non-overlapping bounding boxes', () => {
    const makeTask = (id: string): TaskFlowNode => ({
      id,
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        subject: id,
        trackerId: 1,
        statusId: 1,
        priorityId: 2,
        assignedToId: null,
        fixedVersionId: null,
        estimatedHours: 8,
        startDate: null,
        dueDate: null,
        lockDates: false,
        description: '',
        customFieldValues: {},
      },
    });
    const nodes = ['A', 'B', 'C', 'D'].map(makeTask);
    const edges: TaskFlowEdge[] = [
      { id: 'e1', source: 'A', target: 'B', type: 'dependencyEdge', data: { delay: 0 } },
      { id: 'e2', source: 'B', target: 'C', type: 'dependencyEdge', data: { delay: 0 } },
      { id: 'e3', source: 'A', target: 'D', type: 'dependencyEdge', data: { delay: 0 } },
    ];

    const laidOut = computeAutoLayout(nodes, edges);
    const map = new Map(laidOut.map((n) => [n.id, n]));

    for (const e of edges) {
      const src = map.get(e.source)!;
      const tgt = map.get(e.target)!;
      expect(src.position.x).toBeLessThan(tgt.position.x);
    }

    for (let i = 0; i < laidOut.length; i++) {
      for (let j = i + 1; j < laidOut.length; j++) {
        expect(boxesOverlap(laidOut[i], laidOut[j])).toBe(false);
      }
    }
  });

  it('UT-FE-14: undo/redo ignores intermediate drag coordinates and restores discrete snapshots', () => {
    const store = useFlowStore.getState();
    const id = store.addTaskNode({ position: { x: 100, y: 100 } });
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(useFlowStore.getState().past).toHaveLength(1);

    // Update subject (like onBlur commit)
    useFlowStore.getState().updateNodeData(id, { subject: '確定題名' });
    expect(useFlowStore.getState().past).toHaveLength(2);

    // Simulate intermediate dragging via onNodesChange (should NOT push history)
    useFlowStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 150, y: 150 }, dragging: true },
    ]);
    useFlowStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 200, y: 200 }, dragging: true },
    ]);
    expect(useFlowStore.getState().past).toHaveLength(2);

    // Undo twice -> back to empty nodes
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes[0].data.subject).toBe('新規タスク');
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes).toHaveLength(0);

    // Redo once -> back to node added with initial subject
    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(useFlowStore.getState().nodes[0].data.subject).toBe('新規タスク');
  });

  it('UT-FE-15: deleting GroupNode detaches children without deleting them and keeps groupNodes first', () => {
    const store = useFlowStore.getState();
    const g1 = store.addGroupNode({ x: 100, y: 100 });
    const tA = store.addTaskNode({ position: { x: 120, y: 150 } });
    const tB = store.addTaskNode({ position: { x: 400, y: 150 } });

    useFlowStore.getState().assignNodeToGroup(tA, g1);
    useFlowStore.getState().assignNodeToGroup(tB, g1);

    // Add another group G2 and verify groupNodes precede taskNodes
    const g2 = useFlowStore.getState().addGroupNode({ x: 600, y: 100 });
    const ordered = useFlowStore.getState().nodes;
    const firstTaskIndex = ordered.findIndex((n) => n.type === 'taskNode');
    const lastGroupIndex = ordered
      .map((n) => n.type)
      .lastIndexOf('groupNode');
    expect(lastGroupIndex).toBeLessThan(firstTaskIndex);
    expect(g2).toBeTruthy();

    // Select and delete G1
    useFlowStore.getState().selectNode(g1);
    useFlowStore.getState().deleteSelected();

    const after = useFlowStore.getState().nodes;
    expect(after.find((n) => n.id === g1)).toBeUndefined();
    const childA = after.find((n) => n.id === tA);
    const childB = after.find((n) => n.id === tB);
    expect(childA).toBeDefined();
    expect(childB).toBeDefined();
    expect(childA?.parentId).toBeUndefined();
    expect(childB?.parentId).toBeUndefined();
  });

  it('UT-FE-16: Tab inheritance, Enter parallel branching from all predecessors, and auto lockDates on manual date edit', () => {
    const store = useFlowStore.getState();
    const p1 = store.addTaskNode({ position: { x: 50, y: 50 } });
    const p2 = store.addTaskNode({ position: { x: 50, y: 200 } });
    const a = store.addTaskNode({ position: { x: 400, y: 120 } });

    useFlowStore.getState().updateNodeData(a, {
      trackerId: 1,
      priorityId: 3,
      assignedToId: 10,
      fixedVersionId: 5,
      customFieldValues: { '101': 'バックエンドAPI' },
    });

    useFlowStore.getState().connectNodes({ source: p1, target: a, sourceHandle: null, targetHandle: null });
    useFlowStore.getState().connectNodes({ source: p2, target: a, sourceHandle: null, targetHandle: null });

    // Tab equivalent: addTaskNode({ sourceNodeId: a })
    const tabChildId = useFlowStore.getState().addTaskNode({ sourceNodeId: a });
    const tabChild = useFlowStore.getState().nodes.find((n) => n.id === tabChildId)!;
    expect(tabChild.data.trackerId).toBe(1);
    expect(tabChild.data.priorityId).toBe(3);
    expect(tabChild.data.assignedToId).toBe(10);
    expect(tabChild.data.fixedVersionId).toBe(5);
    expect(tabChild.data.customFieldValues['101']).toBe('バックエンドAPI');
    expect(
      useFlowStore.getState().edges.some((e) => e.source === a && e.target === tabChildId),
    ).toBe(true);

    // Enter equivalent: addTaskNode({ siblingOfNodeId: a })
    const siblingId = useFlowStore.getState().addTaskNode({ siblingOfNodeId: a });
    const edges = useFlowStore.getState().edges;
    expect(edges.some((e) => e.source === p1 && e.target === siblingId)).toBe(true);
    expect(edges.some((e) => e.source === p2 && e.target === siblingId)).toBe(true);

    // Manual date edit sets lockDates = true
    useFlowStore.getState().updateNodeData(siblingId, { startDate: '2026-12-10' });
    const updatedSibling = useFlowStore
      .getState()
      .nodes.find((n) => n.id === siblingId)!;
    expect(updatedSibling.data.lockDates).toBe(true);
    expect(updatedSibling.data.startDate).toBe('2026-12-10');
  });
});
