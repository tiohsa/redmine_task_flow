import { describe, expect, it } from 'vitest';
import { propagateDates } from '../src/domain/datePropagation';
import type { TaskFlowEdge, TaskFlowNode, TaskNodeData } from '../src/types/flow';

function makeTask(
  id: string,
  overrides: Partial<TaskNodeData> = {},
  parentId?: string,
): TaskFlowNode {
  return {
    id,
    type: 'taskNode',
    parentId,
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
      ...overrides,
    },
  };
}

function makeGroup(id: string): TaskFlowNode {
  return {
    id,
    type: 'groupNode',
    position: { x: 0, y: 0 },
    data: {
      subject: id,
      trackerId: 1,
      statusId: 1,
      priorityId: 2,
      assignedToId: null,
      fixedVersionId: null,
      estimatedHours: 100,
      startDate: '2026-01-01',
      dueDate: '2026-01-10',
      lockDates: false,
      description: '',
      customFieldValues: {},
    },
  };
}

function makeEdge(source: string, target: string, delay = 0): TaskFlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'dependencyEdge',
    data: { delay },
  };
}

describe('datePropagation (UT-FE-07 ~ UT-FE-12)', () => {
  it('UT-FE-07: propagates serial calendar dates with delay', () => {
    const nodes = [
      makeTask('A', { estimatedHours: 8 }),
      makeTask('B', { estimatedHours: 8 }),
    ];
    const edges = [makeEdge('A', 'B', 2)];

    const result = propagateDates(nodes, edges, '2026-11-16');
    const nodeA = result.find((n) => n.id === 'A')!;
    const nodeB = result.find((n) => n.id === 'B')!;

    expect(nodeA.data.startDate).toBe('2026-11-16');
    expect(nodeA.data.dueDate).toBe('2026-11-16');
    expect(nodeB.data.startDate).toBe('2026-11-19');
    expect(nodeB.data.dueDate).toBe('2026-11-19');
  });

  it('UT-FE-08: adopts latest candidate startDate on many-to-1 merge', () => {
    const nodes = [
      makeTask('A', { lockDates: true, startDate: '2026-11-16', dueDate: '2026-11-17' }),
      makeTask('B', { lockDates: true, startDate: '2026-11-16', dueDate: '2026-11-19' }),
      makeTask('C', { estimatedHours: 8 }),
    ];
    const edges = [makeEdge('A', 'C', 0), makeEdge('B', 'C', 1)];

    const result = propagateDates(nodes, edges, '2026-11-16');
    const nodeC = result.find((n) => n.id === 'C')!;
    expect(nodeC.data.startDate).toBe('2026-11-21');
    expect(nodeC.data.dueDate).toBe('2026-11-21');
  });

  it('UT-FE-09: guards when all predecessors have dueDate: null and falls back estimatedHours <= 0/null to 8h', () => {
    const nodes = [
      makeTask('A', { lockDates: true, startDate: null, dueDate: null }),
      makeTask('B', { startDate: '2026-11-25', dueDate: '2026-11-25', estimatedHours: null }),
      makeTask('D', { estimatedHours: 0 }),
    ];
    const edges = [makeEdge('A', 'B', 0)];

    const result = propagateDates(nodes, edges, '2026-11-16');
    const nodeB = result.find((n) => n.id === 'B')!;
    const nodeD = result.find((n) => n.id === 'D')!;

    expect(nodeB.data.startDate).toBe('2026-11-25');
    expect(nodeB.data.dueDate).toBe('2026-11-25');
    expect(nodeD.data.startDate).toBe('2026-11-16');
    expect(nodeD.data.dueDate).toBe('2026-11-16');
  });

  it('UT-FE-10: protects lockDates: true nodes and propagates downstream from locked dueDate', () => {
    const nodes = [
      makeTask('A', { lockDates: true, startDate: '2026-11-10', dueDate: '2026-11-12' }),
      makeTask('B', { lockDates: true, startDate: '2026-12-01', dueDate: '2026-12-01' }),
      makeTask('C', { estimatedHours: 8 }),
    ];
    const edges = [makeEdge('A', 'B', 0), makeEdge('B', 'C', 0)];

    const result = propagateDates(nodes, edges, '2026-11-16');
    const nodeB = result.find((n) => n.id === 'B')!;
    const nodeC = result.find((n) => n.id === 'C')!;

    expect(nodeB.data.startDate).toBe('2026-12-01');
    expect(nodeB.data.dueDate).toBe('2026-12-01');
    expect(nodeC.data.startDate).toBe('2026-12-02');
    expect(nodeC.data.dueDate).toBe('2026-12-02');
  });

  it('UT-FE-11: rolls up children startDate, dueDate, and estimatedHours to GroupNode', () => {
    const nodes = [
      makeGroup('G1'),
      makeTask('A', { lockDates: true, startDate: '2026-11-16', dueDate: '2026-11-17', estimatedHours: 4 }, 'G1'),
      makeTask('B', { lockDates: true, startDate: '2026-11-18', dueDate: '2026-11-20', estimatedHours: 12 }, 'G1'),
    ];

    const result = propagateDates(nodes, [], '2026-11-16');
    const group = result.find((n) => n.id === 'G1')!;

    expect(group.data.startDate).toBe('2026-11-16');
    expect(group.data.dueDate).toBe('2026-11-20');
    expect(group.data.estimatedHours).toBe(16);
  });

  it('UT-FE-12: resets GroupNode dates and estimatedHours to null when it has 0 children', () => {
    const nodes = [makeGroup('G1')];
    const result = propagateDates(nodes, [], '2026-11-16');
    const group = result.find((n) => n.id === 'G1')!;

    expect(group.data.startDate).toBeNull();
    expect(group.data.dueDate).toBeNull();
    expect(group.data.estimatedHours).toBeNull();
  });
});
