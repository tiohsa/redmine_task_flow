import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildNormalizedFlowPayload,
  getDraftStorageKey,
  getSavedFlowsStorageKey,
  loadSavedFlowsFromStorage,
  MAX_SAVED_FLOWS,
  MAX_SAVED_FLOW_NAME_LENGTH,
  parseAndSanitizeFlowJson,
  saveDraftToStorage,
  saveSavedFlowsToStorage,
  validateSavedFlowName,
  type SavedFlowEntry,
} from '../src/domain/persistence';
import type { BootstrapData, TaskFlowNode } from '../src/types/flow';

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
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('UT-FE-17: catches QuotaExceededError safely when saving draft to localStorage', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

    try {
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
    } finally {
      spy.mockRestore();
    }
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

  it('validates and trims saved flow names with empty and max length boundaries', () => {
    expect(validateSavedFlowName('')).toEqual({
      ok: false,
      error: '保存名を入力してください',
    });
    expect(validateSavedFlowName('   \t\n  ')).toEqual({
      ok: false,
      error: '保存名を入力してください',
    });

    const exact50 = 'あ'.repeat(MAX_SAVED_FLOW_NAME_LENGTH);
    expect(validateSavedFlowName(`  ${exact50}  `)).toEqual({
      ok: true,
      name: exact50,
    });

    const over50 = 'a'.repeat(MAX_SAVED_FLOW_NAME_LENGTH + 1);
    expect(validateSavedFlowName(over50)).toEqual({
      ok: false,
      error: `保存名は${MAX_SAVED_FLOW_NAME_LENGTH}文字以内で入力してください`,
    });
  });

  it('normalizes nodes/edges and handles corrupted JSON, invalid items, 5-item cap, and QuotaExceededError for saved flows', () => {
    const rawNode: TaskFlowNode = {
      id: 'n1',
      type: 'taskNode',
      position: { x: 10, y: 20 },
      selected: true,
      data: {
        subject: 'テスト',
        trackerId: 1,
        statusId: 1,
        priorityId: 2,
        assignedToId: null,
        fixedVersionId: null,
        estimatedHours: 8,
        startDate: '2026-11-16',
        dueDate: '2026-11-16',
        lockDates: false,
        description: '',
        customFieldValues: {},
        createdIssueId: 999,
      },
    };
    const payload = buildNormalizedFlowPayload([rawNode], [], '2026-11-16');
    expect(payload.nodes[0].selected).toBe(false);
    expect(payload.nodes[0].data.createdIssueId).toBeNull();

    const key = getSavedFlowsStorageKey(12, 10);
    expect(key).toBe('task_flow_saved_v1_12_10');

    // Corrupted JSON returns empty array safely
    window.localStorage.setItem(key, '{invalid json');
    expect(loadSavedFlowsFromStorage(12, 10)).toEqual([]);

    // Filters invalid entries and caps to MAX_SAVED_FLOWS (5)
    const validEntry = (i: number): SavedFlowEntry => ({
      id: `saved_${i}`,
      name: `パターン${i}`,
      updatedAt: '2026-11-14T12:00:00.000Z',
      data: payload,
    });
    window.localStorage.setItem(
      key,
      JSON.stringify([
        null,
        { id: '', name: 'bad', updatedAt: 'x', data: payload },
        { id: 'bad2', name: '  ', updatedAt: 'x', data: payload },
        { id: 'bad3', name: 'badData', updatedAt: 'x', data: { schema_version: 2 } },
        validEntry(1),
        validEntry(2),
        validEntry(3),
        validEntry(4),
        validEntry(5),
        validEntry(6),
      ]),
    );
    const loaded = loadSavedFlowsFromStorage(12, 10);
    expect(loaded).toHaveLength(MAX_SAVED_FLOWS);
    expect(loaded.map((e) => e.id)).toEqual([
      'saved_1',
      'saved_2',
      'saved_3',
      'saved_4',
      'saved_5',
    ]);

    // QuotaExceededError protection
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });
    try {
      const saveRes = saveSavedFlowsToStorage(12, 10, loaded);
      expect(saveRes.ok).toBe(false);
      expect(saveRes.error).toContain('QuotaExceededError');
    } finally {
      spy.mockRestore();
    }
  });
});
