import { describe, expect, it, vi } from 'vitest';
import {
  getDraftStorageKey,
  parseAndSanitizeFlowJson,
  saveDraftToStorage,
} from '../src/domain/persistence';
import type { BootstrapData } from '../src/types/flow';

const BOOTSTRAP: BootstrapData = {
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
          possible_values: ['フロントエンド'],
        },
      ],
    },
  ],
  statuses: [
    { id: 1, name: '新規', is_default: true },
    { id: 2, name: '進行中', is_default: false },
  ],
  priorities: [{ id: 2, name: '通常', is_default: true }],
  assignable_users: [{ id: 10, name: '山田 太郎' }],
  versions: [{ id: 5, name: 'v1.0' }],
  current_user_id: 10,
};

describe('persistence (UT-FE-17 ~ UT-FE-18)', () => {
  it('UT-FE-17: catches QuotaExceededError safely when saving draft to localStorage', () => {
    const spy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

    expect(getDraftStorageKey(12, 10)).toBe('task_flow_draft_v1_12_10');
    const result = saveDraftToStorage(12, 10, {
      schema_version: 1,
      baseDate: '2026-11-16',
      nodes: [],
      edges: [],
    });

    expect(spy).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('QuotaExceededError');
  });

  it('UT-FE-18: falls back invalid cross-project IDs on JSON import and returns warnings', () => {
    const rawJson = JSON.stringify({
      schema_version: 1,
      baseDate: '2026-11-16',
      nodes: [
        {
          id: 'n1',
          type: 'taskNode',
          position: { x: 100, y: 100 },
          data: {
            subject: '別プロジェクトのタスク',
            trackerId: 999,
            statusId: 888,
            priorityId: 777,
            assignedToId: 666,
            fixedVersionId: 555,
            estimatedHours: 8,
            startDate: null,
            dueDate: null,
            lockDates: false,
            description: '',
            customFieldValues: { '901': 'old_cf', '101': 'フロントエンド' },
          },
        },
      ],
      edges: [],
    });

    const result = parseAndSanitizeFlowJson(rawJson, BOOTSTRAP);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(5);

    const node = result.data!.nodes[0];
    expect(node.data.trackerId).toBe(1);
    expect(node.data.statusId).toBe(1);
    expect(node.data.priorityId).toBe(2);
    expect(node.data.assignedToId).toBeNull();
    expect(node.data.fixedVersionId).toBeNull();
    expect(node.data.customFieldValues).toEqual({ '101': 'フロントエンド' });
  });
});
