import { expect, it, vi } from 'vitest';
import { getDraftStorageKey } from '../src/domain/persistence';
import { useFlowStore } from '../src/store/useFlowStore';
import { bootstrap, request, setupFlow, task } from './bulkNodeEditFixture';

it('BNE-06 writes the complete v1 draft once before undo or redo', () => {
  setupFlow([task('A'), task('B'), task('C')], [
    { id: 'A-C', source: 'A', target: 'C', type: 'dependencyEdge', data: { delay: 2 } },
  ]);
  const state = useFlowStore.getState;
  const { nodes: originalNodes, edges: originalEdges, baseDate } = state();
  const nodes = structuredClone(originalNodes);
  const edges = structuredClone(originalEdges);
  const expectedNodes = nodes.map((node) => request.nodeIds.includes(node.id)
    ? { ...node, data: { ...node.data, priorityId: 2 } }
    : node);
  const key = getDraftStorageKey(bootstrap.project.id, bootstrap.current_user_id);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  try {
    expect(state().applyBulkNodeEdit(request)).toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({
      schema_version: 1, nodes: expectedNodes, edges, baseDate,
    });
  } finally {
    write.mockRestore();
  }
});

it('BNE-06 restores a bulk change with existing history and draft', () => {
  setupFlow([task('A', { customFieldValues: { '20': 'old', '22': 'shared' } }), task('B')]);
  const state = useFlowStore.getState;
  const before = state().nodes;
  state().applyBulkNodeEdit({ ...request, changes: { trackerId: 2 } });
  const changed = state().nodes;
  state().undo();
  expect(state().nodes).toEqual(before);
  state().redo();
  expect(state().nodes).toEqual(changed);
  state().initialize(bootstrap, '/bulk_create.json');
  expect(state().nodes.map(({ data }) => [data.trackerId, data.customFieldValues])).toEqual([
    [2, { '22': 'shared' }], [2, {}],
  ]);
});

it('BNE-08 restores all 100 edited nodes and the draft with a single undo', () => {
  const group = { ...task('group'), type: 'groupNode' as const };
  const tasks = Array.from({ length: 99 }, (_, index) => task(`task-${index}`));
  const selected = [group, ...tasks];
  setupFlow([...selected, task('unselected')]);
  const state = useFlowStore.getState;
  const before = state().nodes;
  const key = getDraftStorageKey(bootstrap.project.id, bootstrap.current_user_id);
  const beforeDraft = localStorage.getItem(key);

  expect(state().applyBulkNodeEdit({ ...request, nodeIds: selected.map(({ id }) => id) })).toEqual({ ok: true });
  expect(state().nodes.map(({ id, data }) => [id, data.priorityId])).toEqual([
    ...selected.map(({ id }) => [id, 2]), ['unselected', 1],
  ]);
  state().undo();

  expect(state().nodes).toEqual(before);
  expect(localStorage.getItem(key)).toEqual(beforeDraft);
});
