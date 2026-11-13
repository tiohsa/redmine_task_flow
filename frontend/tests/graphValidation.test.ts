import { describe, expect, it } from 'vitest';
import { validateConnection } from '../src/domain/graphValidation';
import type { TaskFlowEdge, TaskFlowNode, TaskNodeData } from '../src/types/flow';

function makeData(subject: string): TaskNodeData {
  return {
    subject,
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
  };
}

function makeTask(id: string): TaskFlowNode {
  return {
    id,
    type: 'taskNode',
    position: { x: 0, y: 0 },
    data: makeData(id),
  };
}

function makeGroup(id: string): TaskFlowNode {
  return {
    id,
    type: 'groupNode',
    position: { x: 0, y: 0 },
    data: makeData(id),
  };
}

function makeEdge(source: string, target: string): TaskFlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'dependencyEdge',
    data: { delay: 0 },
  };
}

describe('graphValidation (UT-FE-01 ~ UT-FE-06)', () => {
  it('UT-FE-01: allows valid 1-to-many branching and many-to-1 converging connections', () => {
    const nodes = [makeTask('A'), makeTask('B'), makeTask('C'), makeTask('D')];
    const edges = [makeEdge('A', 'B')];

    expect(validateConnection('A', 'C', nodes, edges)).toEqual({ ok: true });
    const withBranch = [...edges, makeEdge('A', 'C')];
    expect(validateConnection('B', 'D', nodes, withBranch)).toEqual({ ok: true });
    const withOneMerge = [...withBranch, makeEdge('B', 'D')];
    expect(validateConnection('C', 'D', nodes, withOneMerge)).toEqual({ ok: true });
  });

  it('UT-FE-02: rejects self-loop connection', () => {
    const nodes = [makeTask('A')];
    const res = validateConnection('A', 'A', nodes, []);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('UT-FE-03: rejects duplicate edge', () => {
    const nodes = [makeTask('A'), makeTask('B')];
    const edges = [makeEdge('A', 'B')];
    const res = validateConnection('A', 'B', nodes, edges);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('UT-FE-04: rejects direct 2-node cycle', () => {
    const nodes = [makeTask('A'), makeTask('B')];
    const edges = [makeEdge('A', 'B')];
    const res = validateConnection('B', 'A', nodes, edges);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('循環');
  });

  it('UT-FE-05: rejects indirect multi-hop cycle', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E'].map(makeTask);
    const edges = [
      makeEdge('A', 'B'),
      makeEdge('B', 'C'),
      makeEdge('C', 'D'),
      makeEdge('D', 'E'),
    ];
    const res = validateConnection('E', 'B', nodes, edges);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('循環');
  });

  it('UT-FE-06: rejects edges with groupNode as source or target', () => {
    const nodes = [makeGroup('G1'), makeTask('A')];
    const res1 = validateConnection('G1', 'A', nodes, []);
    const res2 = validateConnection('A', 'G1', nodes, []);
    expect(res1.ok).toBe(false);
    expect(res2.ok).toBe(false);
  });
});
