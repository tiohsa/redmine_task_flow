import { useFlowStore } from '../src/store/useFlowStore';
import type { BootstrapData, TaskFlowEdge, TaskFlowNode } from '../src/types/flow';

export const bootstrap: BootstrapData = {
  project: { id: 12, identifier: 'bulk-edit', name: 'Bulk Edit' },
  current_user_id: 10,
  trackers: [
    { id: 1, name: '元のトラッカー', default_status_id: 1, allowed_status_ids: [1, 2], disabled_core_fields: [], custom_fields: [
      { id: 20, name: '旧フィールド', field_format: 'string', is_required: false },
      { id: 22, name: '共通フィールド', field_format: 'string', is_required: false },
    ] },
    { id: 2, name: '新しいトラッカー', default_status_id: 1, allowed_status_ids: [1, 2], disabled_core_fields: [], custom_fields: [
      { id: 21, name: '必須フィールド', field_format: 'string', is_required: true },
      { id: 22, name: '共通フィールド', field_format: 'string', is_required: false },
    ] },
    { id: 3, name: '制限付きトラッカー', default_status_id: 1, allowed_status_ids: [1], disabled_core_fields: ['assigned_to_id', 'fixed_version_id'], custom_fields: [] },
  ],
  statuses: [{ id: 1, name: '新規', is_default: true }, { id: 2, name: '進行中', is_default: false }],
  priorities: [{ id: 1, name: '通常', is_default: true }, { id: 2, name: '高', is_default: false }],
  assignable_users: [{ id: 10, name: '作業者' }],
  versions: [{ id: 5, name: 'バージョン 1' }],
};

export function task(id: string, data: Partial<TaskFlowNode['data']> = {}): TaskFlowNode {
  return {
    id, type: 'taskNode', position: { x: 0, y: 0 },
    data: {
      subject: id, trackerId: 1, statusId: 1, priorityId: 1, assignedToId: null,
      fixedVersionId: null, estimatedHours: null, startDate: null, dueDate: null,
      lockDates: false, description: '', customFieldValues: {}, ...data,
    },
  };
}

export function setupFlow(nodes: TaskFlowNode[] = [task('A'), task('B')], edges: TaskFlowEdge[] = []) {
  window.localStorage.clear();
  useFlowStore.setState({ ...useFlowStore.getInitialState() });
  useFlowStore.getState().initialize(bootstrap, '/bulk_create.json');
  useFlowStore.getState().importJson(JSON.stringify({
    schema_version: 1, nodes, edges, baseDate: '2026-11-16',
  }));
}

export const request = { nodeIds: ['A', 'B'], changes: { priorityId: 2 } };
