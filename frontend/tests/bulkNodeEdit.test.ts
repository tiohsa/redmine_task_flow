import { expect, it } from 'vitest';
import { evaluateBulkNodeEdit, type BulkNodeEditRequest } from '../src/features/bulk-node-edit';
import type { TaskNodeData } from '../src/types/flow';
import { bootstrap, task } from './bulkNodeEditFixture';

it('BNE-01 edits four fields on a task and group while preserving their other data', () => {
  const a = task('A', { statusId: 2, customFieldValues: { '20': 'keep' } });
  const group = { ...task('B'), type: 'groupNode' as const };
  const child = { ...task('C'), parentId: 'B' };
  const changes = { trackerId: 2, priorityId: 2, assignedToId: 10, fixedVersionId: 5 };
  expect(evaluateBulkNodeEdit([a, group, child], bootstrap, { nodeIds: ['A', 'B'], changes }).result).toEqual({
    ok: true, changedNodeIds: ['A', 'B'],
    nodes: [{ ...a, data: { ...a.data, ...changes } }, { ...group, data: { ...group.data, ...changes } }, child],
  });
});

it('BNE-02 clears nullable fields without changing unspecified or already-clear data', () => {
  const a = task('A', { assignedToId: 10, fixedVersionId: 5, priorityId: 2 });
  const b = task('B');
  const changes = { assignedToId: null, fixedVersionId: null };
  expect(evaluateBulkNodeEdit([a, b], bootstrap, { nodeIds: ['A', 'B'], changes }).result).toEqual({
    ok: true, changedNodeIds: ['A'], nodes: [{ ...a, data: { ...a.data, ...changes } }, b],
  });
});

it('BNE-03 evaluates all effective trackers and rejects invalid IDs', () => {
  const nodes = [task('A'), task('B', { trackerId: 3 })];
  const nodeIds = ['A', 'B'];
  const blocked = evaluateBulkNodeEdit(nodes, bootstrap, { nodeIds, changes: { assignedToId: null, fixedVersionId: null } });
  const enabled = evaluateBulkNodeEdit(nodes, bootstrap, { nodeIds, changes: { trackerId: 2, assignedToId: 99, fixedVersionId: 99 } });
  expect(blocked.candidates.assignedToId).toBeNull();
  expect(blocked.candidates.fixedVersionId).toBeNull();
  expect(blocked.result).toMatchObject({ ok: false, issues: [{ field: 'assignedToId', nodeId: 'B' }, { field: 'fixedVersionId', nodeId: 'B' }] });
  expect(enabled.candidates.assignedToId).toEqual(bootstrap.assignable_users);
  expect(enabled.result).toMatchObject({ ok: false, issues: [{ field: 'assignedToId' }, { field: 'fixedVersionId' }] });
});

it('BNE-03 resolves a legacy tracker ID and preserves equivalent attribute IDs', () => {
  const legacyIds = { trackerId: '1', priorityId: '2', assignedToId: '10', fixedVersionId: '5' };
  const a = task('A', legacyIds as unknown as Partial<TaskNodeData>);
  const b = task('B');
  const changes = { priorityId: 2, assignedToId: 10, fixedVersionId: 5 };
  const { candidates, result } = evaluateBulkNodeEdit([a, b], bootstrap, { nodeIds: ['A', 'B'], changes });
  expect(candidates.assignedToId).toEqual(bootstrap.assignable_users);
  expect(candidates.fixedVersionId).toEqual(bootstrap.versions);
  expect(result).toEqual({
    ok: true, changedNodeIds: ['B'], nodes: [a, { ...b, data: { ...b.data, ...changes } }],
  });
});

it('BNE-04 names the node whose status cannot be preserved', () => {
  const nodes = [task('A', { statusId: 2 }), task('B')];
  const { result } = evaluateBulkNodeEdit(nodes, bootstrap, { nodeIds: ['A', 'B'], changes: { trackerId: 3 } });
  expect(result).toMatchObject({ ok: false, issues: [{ field: 'trackerId', nodeId: 'A' }] });
});

it('BNE-04 matches a legacy status ID when switching trackers', () => {
  const a = task('A', { statusId: '2' } as unknown as Partial<TaskNodeData>);
  const b = task('B');
  const { result } = evaluateBulkNodeEdit([a, b], bootstrap, { nodeIds: ['A', 'B'], changes: { trackerId: 2 } });
  expect(result).toEqual({
    ok: true, changedNodeIds: ['A', 'B'], nodes: [a, b].map((node) => ({ ...node, data: { ...node.data, trackerId: 2 } })),
  });
});

it('BNE-04 reports an incompatible node even when fewer than two are selected', () => {
  const nodes = [task('A'), task('B', { statusId: 2 })];
  const { result } = evaluateBulkNodeEdit(nodes, bootstrap, { nodeIds: ['B'], changes: { trackerId: 3 } });
  expect(result).toMatchObject({ ok: false, issues: [
    { message: '対象を 2 件以上選択してください' },
    { nodeId: 'B', field: 'trackerId', message: '変更先で現在のステータスを維持できません' },
  ] });
});

it('BNE-10 reports missing targets and invalid values alongside an exceeded limit', () => {
  const nodes = Array.from({ length: 100 }, (_, i) => task(String(i)));
  const nodeIds = [...nodes.map(({ id }) => id), 'missing'];
  const { result } = evaluateBulkNodeEdit(nodes, bootstrap, { nodeIds, changes: { priorityId: 99 } });
  expect(result).toMatchObject({ ok: false, issues: [
    { message: '選択数 101 件は上限 100 件を超えています' },
    { nodeId: 'missing', message: '対象ノードが見つかりません' },
    { field: 'priorityId', message: '指定した優先度を選択できません' },
  ] });
});

it.each<BulkNodeEditRequest>([
  { nodeIds: [], changes: { priorityId: 2 } },
  { nodeIds: ['A'], changes: { priorityId: 2 } },
  { nodeIds: ['A', 'B'], changes: {} },
  { nodeIds: ['A', 'B'], changes: { priorityId: 1 } },
])('BNE-05 rejects an incomplete or unchanged request %j', (request) => {
  expect(evaluateBulkNodeEdit([task('A'), task('B')], bootstrap, request).result).toMatchObject({ ok: false });
});

it.each([99, 100])('BNE-08 applies %i selected nodes in a larger flow', (count) => {
  const nodes = Array.from({ length: 101 }, (_, i) => task(String(i)));
  nodes[0] = { ...nodes[0], type: 'groupNode' };
  const nodeIds = nodes.slice(0, count).map(({ id }) => id);
  const { result } = evaluateBulkNodeEdit(nodes, bootstrap, { nodeIds, changes: { priorityId: 2 } });
  expect(result).toMatchObject({ ok: true, changedNodeIds: nodeIds });
});

it('BNE-10 rejects a target that no longer exists', () => {
  const { result } = evaluateBulkNodeEdit([task('B')], bootstrap, { nodeIds: ['A', 'B'], changes: { priorityId: 2 } });
  expect(result).toMatchObject({ ok: false, issues: [{ nodeId: 'A' }] });
});
