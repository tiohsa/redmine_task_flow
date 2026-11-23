import { afterEach, expect, it, vi } from 'vitest';
import { getDraftStorageKey } from '../src/domain/persistence';
import { useFlowStore } from '../src/store/useFlowStore';
import { bootstrap, request, setupFlow, task } from './bulkNodeEditFixture';

const draftKey = getDraftStorageKey(bootstrap.project.id, bootstrap.current_user_id);
const state = useFlowStore.getState;

afterEach(() => vi.restoreAllMocks());

function snapshot() {
  const { nodes, past, future } = state();
  return structuredClone({ nodes, past, future, draft: localStorage.getItem(draftKey) });
}

it.each([
  { edit: { ...request, nodeIds: [] }, message: '対象を 2 件以上選択してください' },
  { edit: { ...request, nodeIds: ['A'] }, message: '対象を 2 件以上選択してください' },
  { edit: { ...request, changes: {} }, message: '変更する属性を指定してください' },
  { edit: { ...request, changes: { priorityId: 1 } }, message: '変更される値がありません' },
])('BNE-05 preserves the graph, history and draft on refusal: $edit', ({ edit, message }) => {
  setupFlow();
  state().applyBulkNodeEdit(request);
  state().undo();
  const before = snapshot();
  expect(state().applyBulkNodeEdit(edit)).toEqual({ ok: false, issues: [{ message }] });
  expect(snapshot()).toEqual(before);
});

it.each(['isSubmitting', 'isSubmitted'] as const)('BNE-05 preserves graph, history and draft while %s', (flag) => {
  setupFlow();
  useFlowStore.setState({ [flag]: true });
  const before = snapshot();
  expect(state().applyBulkNodeEdit(request)).toMatchObject({ ok: false });
  expect(snapshot()).toEqual(before);
});

it('BNE-04 leaves all state intact for a tracker with incompatible status', () => {
  setupFlow([task('A', { statusId: 2 }), task('B')]);
  const before = snapshot();
  const result = state().applyBulkNodeEdit({ ...request, changes: { trackerId: 3 } });
  expect(result).toMatchObject({ ok: false, issues: [{ nodeId: 'A' }] });
  expect(snapshot()).toEqual(before);
});

it('BNE-08 rejects 101 selected nodes and accepts a correction to 100', () => {
  setupFlow(Array.from({ length: 101 }, (_, i) => task(String(i))));
  const nodeIds = state().nodes.map(({ id }) => id);
  const before = snapshot();
  expect(state().applyBulkNodeEdit({ ...request, nodeIds })).toMatchObject({ ok: false });
  expect(snapshot()).toEqual(before);
  expect(state().applyBulkNodeEdit({ ...request, nodeIds: nodeIds.slice(1) })).toEqual({ ok: true });
  expect(state().nodes.filter((node) => node.data.priorityId === 2)).toHaveLength(100);
});

it('BNE-10 rejects stale selections and can retry with the current nodes', () => {
  setupFlow([task('A'), task('B'), task('C')]);
  state().selectNode('A');
  state().deleteSelected();
  const before = snapshot();
  expect(state().applyBulkNodeEdit(request)).toMatchObject({ ok: false, issues: [{ nodeId: 'A' }] });
  expect(snapshot()).toEqual(before);
  expect(state().applyBulkNodeEdit({ ...request, nodeIds: ['B', 'C'] })).toEqual({ ok: true });
  expect(state().nodes.map((node) => node.data.priorityId)).toEqual([2, 2]);
});

it.each([
  ['assignedToId', 10, '指定した担当者を選択できません'],
  ['fixedVersionId', 5, '指定した対象バージョンを選択できません'],
] as const)('BNE-10 preserves graph, history and draft on an invalid %s and accepts a correction', (field, validId, message) => {
  setupFlow();
  const before = snapshot();
  const rejected = state().applyBulkNodeEdit({ ...request, changes: { ...request.changes, [field]: 99 } });
  expect(rejected).toEqual({ ok: false, issues: [{ field, message }] });
  expect(snapshot()).toEqual(before);

  const corrected = state().applyBulkNodeEdit({ ...request, changes: { ...request.changes, [field]: validId } });
  expect(corrected).toEqual({ ok: true });
  expect(state().nodes.map(({ data }) => [data.priorityId, data[field]])).toEqual([[2, validId], [2, validId]]);
  expect(JSON.parse(localStorage.getItem(draftKey) ?? 'null')).toMatchObject({
    nodes: [{ data: { priorityId: 2, [field]: validId } }, { data: { priorityId: 2, [field]: validId } }],
  });
});

it('BNE-10 preserves the prior graph, history and stored draft on write failure', () => {
  setupFlow();
  const before = snapshot();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  expect(state().applyBulkNodeEdit(request)).toMatchObject({ ok: false });
  expect(snapshot()).toEqual(before);
  write.mockRestore();
  expect(state().applyBulkNodeEdit(request)).toEqual({ ok: true });
  expect(state().nodes.map((node) => node.data.priorityId)).toEqual([2, 2]);
});
