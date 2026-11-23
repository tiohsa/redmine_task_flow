import { afterEach, expect, it, vi } from 'vitest';
import { getDraftStorageKey } from '../src/domain/persistence';
import { useFlowStore } from '../src/store/useFlowStore';
import { bootstrap, request, setupFlow } from './bulkNodeEditFixture';

const state = useFlowStore.getState;
const draft = () => localStorage.getItem(getDraftStorageKey(bootstrap.project.id, bootstrap.current_user_id));
const created = Response.json({ issues: [
  { temp_id: 'A', id: 101, start_date: null, due_date: null },
  { temp_id: 'B', id: 102, start_date: null, due_date: null },
], relations: [] }, { status: 201 });

afterEach(() => vi.unstubAllGlobals());

it('BNE-07 applies an incomplete tracker change, then submits all four fields after completion', async () => {
  setupFlow();
  const changes = { trackerId: 2, priorityId: 2, assignedToId: 10, fixedVersionId: 5 };
  expect(state().applyBulkNodeEdit({ ...request, changes })).toEqual({ ok: true });
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(created.clone());
  vi.stubGlobal('fetch', fetch);
  await state().submitBulkCreate();
  expect(state().validationErrors).toEqual({
    A: ['カスタムフィールド「必須フィールド」は必須です'], B: ['カスタムフィールド「必須フィールド」は必須です'],
  });
  expect(fetch).not.toHaveBeenCalled();
  for (const id of request.nodeIds) state().updateNodeData(id, { customFieldValues: { '21': 'Frontend' } });
  await state().submitBulkCreate();
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
    issues: [
      { temp_id: 'A', tracker_id: 2, priority_id: 2, assigned_to_id: 10, fixed_version_id: 5, custom_field_values: { '21': 'Frontend' } },
      { temp_id: 'B', tracker_id: 2, priority_id: 2, assigned_to_id: 10, fixed_version_id: 5, custom_field_values: { '21': 'Frontend' } },
    ],
  });
  expect(state().isSubmitted).toBe(true);
});

it.each([
  [() => new Response(null, { status: 403 }), '一括登録の権限がありません'],
  [() => Response.json({ error: 'アクセス権限がありません' }, { status: 403 }), 'アクセス権限がありません'],
])('BNE-09 preserves editor contents after a forbidden response', async (response, message) => {
  setupFlow();
  state().applyBulkNodeEdit(request);
  const before = { nodes: state().nodes, draft: draft() };
  vi.stubGlobal('fetch', async () => response());
  await state().submitBulkCreate();
  expect(state().toasts.slice(-1)[0]).toMatchObject({ type: 'error', message });
  expect(state()).toMatchObject({ isSubmitted: false, isSubmitting: false, createdIssuesMap: {}, nodes: before.nodes });
  expect(draft()).toBe(before.draft);
});

it('BNE-11 exposes save failure details and keeps the bulk edit for retry', async () => {
  setupFlow();
  state().applyBulkNodeEdit(request);
  const before = { nodes: state().nodes, draft: draft() };
  const errors = [
    { temp_id: 'B', messages: ['サーバーで保存できません'] },
    { temp_id: 'B', messages: ['関連を保存できません', '対象を確認してください'] },
  ];
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ errors }, { status: 422 }))
    .mockResolvedValueOnce(created.clone()));
  await state().submitBulkCreate();
  expect(state()).toMatchObject({
    nodes: before.nodes.map((node) => ({ ...node, selected: node.id === 'B' })),
    isSubmitted: false, resultModalMode: 'error', validationErrors: {
      B: ['サーバーで保存できません', '関連を保存できません', '対象を確認してください'],
    },
  });
  expect(draft()).toBe(before.draft);
  state().updateNodeData('B', { subject: '修正済み' });
  await state().submitBulkCreate();
  expect(state().createdIssuesMap).toMatchObject({ A: { id: 101 }, B: { id: 102 } });
});
