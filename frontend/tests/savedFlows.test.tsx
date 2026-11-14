import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import * as client from '../src/api/client';
import {
  getDraftStorageKey,
  getSavedFlowsStorageKey,
  loadDraftFromStorage,
  loadSavedFlowsFromStorage,
  MAX_SAVED_FLOWS,
  MAX_SAVED_FLOW_NAME_LENGTH,
} from '../src/domain/persistence';
import { useFlowStore } from '../src/store/useFlowStore';
import type { BootstrapData } from '../src/types/flow';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const BOOTSTRAP_MAIN: BootstrapData = {
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
          is_required: false,
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

const BOOTSTRAP_OTHER_PROJECT: BootstrapData = {
  ...BOOTSTRAP_MAIN,
  project: { id: 99, identifier: 'other-proj', name: '別プロジェクト' },
};

function resetStoreState() {
  useFlowStore.setState({
    bootstrap: null,
    bulkCreateUrl: '',
    projectIdentifier: '',
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
    resultModalOpen: false,
    resultModalMode: null,
    submitErrorMessages: [],
    toasts: [],
    focusSubjectSeq: 0,
    isInspectorCollapsed: false,
    savedFlows: [],
  });
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Saved Flows (max 5 named saves)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    window.localStorage.clear();
    resetStoreState();
    vi.spyOn(client, 'fetchBootstrap').mockResolvedValue(BOOTSTRAP_MAIN);

    container = document.createElement('div');
    container.className = 'task-flow-root';
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <App
          bootstrapUrl="/projects/ec-renewal/task_flow/bootstrap.json"
          bulkCreateUrl="/projects/ec-renewal/task_flow/bulk_create.json"
        />,
      );
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function openSavedModal() {
    const btn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="保存・読込"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();
  }

  function getModal(): HTMLDivElement | null {
    return container.querySelector<HTMLDivElement>(
      '[data-testid="saved-flows-modal"]',
    );
  }

  it('saves up to 5 named flows, persists across re-initialize, blocks 6th save, and allows saving again after delete', async () => {
    await act(async () => {
      openSavedModal();
    });
    expect(getModal()).not.toBeNull();
    expect(
      container.querySelector('[data-testid="saved-flows-count"]')?.textContent,
    ).toBe('0 / 5 件');

    // Empty / whitespace validation
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="保存名"]',
      )!;
      setReactInputValue(input, '   ');
      container
        .querySelector<HTMLButtonElement>('button[aria-label="新規保存"]')!
        .click();
    });
    expect(
      container.querySelector('[data-testid="saved-flows-error"]')?.textContent,
    ).toContain('保存名を入力してください');

    // Save 5 flows
    for (let i = 1; i <= MAX_SAVED_FLOWS; i += 1) {
      await act(async () => {
        const input = container.querySelector<HTMLInputElement>(
          'input[aria-label="保存名"]',
        )!;
        setReactInputValue(input, `  パターン${i}  `);
        container
          .querySelector<HTMLButtonElement>('button[aria-label="新規保存"]')!
          .click();
      });
    }

    expect(
      container.querySelector('[data-testid="saved-flows-count"]')?.textContent,
    ).toBe('5 / 5 件');
    expect(
      container.querySelectorAll('[data-testid="saved-flow-item"]').length,
    ).toBe(5);
    expect(
      container.querySelector('[data-testid="saved-flows-error"]')?.textContent,
    ).toContain('最大5件');

    // Attempt 6th save via UI and store -> blocked
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="保存名"]',
      )!;
      setReactInputValue(input, 'パターン6');
      container
        .querySelector<HTMLButtonElement>('button[aria-label="新規保存"]')!
        .click();
    });
    expect(useFlowStore.getState().savedFlows).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-testid="saved-flow-item"]').length,
    ).toBe(5);
    expect(
      container.querySelector('[data-testid="saved-flows-error"]')?.textContent,
    ).toContain('最大5件');

    // Verify persistence across simulated reload (initialize)
    await act(async () => {
      useFlowStore.getState().initialize(BOOTSTRAP_MAIN, '/bulk');
    });
    expect(useFlowStore.getState().savedFlows).toHaveLength(5);
    expect(useFlowStore.getState().savedFlows[0].name).toBe('パターン1');

    // Isolated by project/user
    expect(
      loadSavedFlowsFromStorage(
        BOOTSTRAP_OTHER_PROJECT.project.id,
        BOOTSTRAP_OTHER_PROJECT.current_user_id,
      ),
    ).toEqual([]);

    // Delete 1st item -> count becomes 4, error clears, and saving 6th succeeds
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="「パターン1」を削除"]')!
        .click();
    });
    expect(
      container.querySelector('[data-testid="saved-flows-count"]')?.textContent,
    ).toBe('4 / 5 件');
    expect(
      container.querySelector('[data-testid="saved-flows-error"]'),
    ).toBeNull();

    await act(async () => {
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="保存名"]',
      )!;
      setReactInputValue(input, 'パターン6');
      container
        .querySelector<HTMLButtonElement>('button[aria-label="新規保存"]')!
        .click();
    });
    expect(useFlowStore.getState().savedFlows).toHaveLength(5);
    expect(
      useFlowStore.getState().savedFlows.map((s) => s.name),
    ).toContain('パターン6');
  });

  it('loads saved flow with Undo support, draft sync, normalization, and closes modal', async () => {
    // Save flow A with 2 nodes
    await act(async () => {
      const store = useFlowStore.getState();
      const firstId = store.nodes[0].id;
      store.updateNodeData(firstId, { subject: '保存Aのタスク' });
      const res = store.saveCurrentFlowAsNew('保存A');
      expect(res.ok).toBe(true);
    });

    expect(useFlowStore.getState().savedFlows).toHaveLength(1);

    // Modify canvas to a different state and simulate submitted state
    await act(async () => {
      const store = useFlowStore.getState();
      store.resetFlow();
      const currentNodeId = useFlowStore.getState().nodes[0].id;
      store.updateNodeData(currentNodeId, { subject: '編集中の別タスク' });
      useFlowStore.setState({ isSubmitted: true });
    });

    expect(useFlowStore.getState().isSubmitted).toBe(true);
    expect(useFlowStore.getState().nodes[0].data.subject).toBe('編集中の別タスク');

    // Open modal while submitted and load 保存A
    await act(async () => {
      openSavedModal();
    });
    expect(getModal()).not.toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="「保存A」を読込"]')!
        .click();
    });

    // Modal closes and canvas switches to 保存A as unsubmitted
    expect(getModal()).toBeNull();
    const afterLoad = useFlowStore.getState();
    expect(afterLoad.isSubmitted).toBe(false);
    expect(afterLoad.nodes[0].data.subject).toBe('保存Aのタスク');
    expect(afterLoad.nodes[0].data.createdIssueId).toBeNull();

    // Auto-draft localStorage is also updated
    const draftRaw = loadDraftFromStorage(
      BOOTSTRAP_MAIN.project.id,
      BOOTSTRAP_MAIN.current_user_id,
    );
    expect(draftRaw).not.toBeNull();
    expect(draftRaw!).toContain('保存Aのタスク');
    expect(
      window.localStorage.getItem(
        getDraftStorageKey(
          BOOTSTRAP_MAIN.project.id,
          BOOTSTRAP_MAIN.current_user_id,
        ),
      ),
    ).not.toBeNull();

    // Undo restores previous canvas before load
    await act(async () => {
      useFlowStore.getState().undo();
    });
    expect(useFlowStore.getState().nodes[0].data.subject).toBe('編集中の別タスク');
  });

  it('overwrites an existing saved flow without increasing count and normalizes createdIssueId', async () => {
    await act(async () => {
      const store = useFlowStore.getState();
      store.saveCurrentFlowAsNew('案件テンプレート');
    });

    const beforeEntry = useFlowStore.getState().savedFlows[0];
    const beforeCount = beforeEntry.data.nodes.length;

    await act(async () => {
      const store = useFlowStore.getState();
      store.addTaskNode({ position: { x: 20, y: 20 } });
      // Simulate submitted node with createdIssueId before saving/overwriting
      useFlowStore.setState({
        isSubmitted: true,
        nodes: useFlowStore.getState().nodes.map((n, idx) => ({
          ...n,
          selected: idx === 0,
          data: { ...n.data, createdIssueId: 500 + idx },
        })),
      });
    });

    await act(async () => {
      openSavedModal();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="「案件テンプレート」を上書き保存"]',
        )!
        .click();
    });

    const saved = useFlowStore.getState().savedFlows;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(beforeEntry.id);
    expect(saved[0].data.nodes).toHaveLength(beforeCount + 1);
    expect(
      saved[0].data.nodes.every((n) => n.data.createdIssueId === null && !n.selected),
    ).toBe(true);
  });

  it('keeps fullscreen when closing SavedFlowsModal with Escape and applies .task-flow-modal layering', async () => {
    const editor = container.querySelector<HTMLDivElement>(
      '[data-testid="task-flow-editor-container"]',
    )!;

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="全画面表示"]')!
        .click();
    });
    expect(editor.dataset.fullscreen).toBe('true');

    await act(async () => {
      openSavedModal();
    });
    const modal = getModal();
    expect(modal).not.toBeNull();
    expect(modal!.classList.contains('task-flow-modal')).toBe(true);

    // 1st Escape closes only the modal and keeps fullscreen
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(getModal()).toBeNull();
    expect(editor.dataset.fullscreen).toBe('true');

    // 2nd Escape exits fullscreen
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(editor.dataset.fullscreen).toBe('false');
  });

  it('validates over-50-char names, falls back invalid IDs on load, and handles QuotaExceededError safely', async () => {
    const over50 = 'x'.repeat(MAX_SAVED_FLOW_NAME_LENGTH + 1);
    expect(useFlowStore.getState().saveCurrentFlowAsNew(over50)).toEqual({
      ok: false,
      error: `保存名は${MAX_SAVED_FLOW_NAME_LENGTH}文字以内で入力してください`,
    });

    // Inject cross-project invalid tracker/assignee IDs into saved storage
    const key = getSavedFlowsStorageKey(
      BOOTSTRAP_MAIN.project.id,
      BOOTSTRAP_MAIN.current_user_id,
    );
    window.localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: 'saved_cross',
          name: '別PJデータ',
          updatedAt: '2026-11-14T00:00:00.000Z',
          data: {
            schema_version: 1,
            baseDate: '2026-11-16',
            nodes: [
              {
                id: 't1',
                type: 'taskNode',
                position: { x: 100, y: 100 },
                data: {
                  subject: '他PJタスク',
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
                  customFieldValues: { '901': 'x' },
                },
              },
            ],
            edges: [],
          },
        },
      ]),
    );

    await act(async () => {
      useFlowStore.getState().initialize(BOOTSTRAP_MAIN, '/bulk');
    });

    const loadRes = await act(async () => {
      return useFlowStore.getState().loadSavedFlow('saved_cross');
    });
    expect(loadRes.ok).toBe(true);
    expect(loadRes.warnings.length).toBeGreaterThanOrEqual(5);
    expect(useFlowStore.getState().nodes[0].data.trackerId).toBe(1);
    expect(useFlowStore.getState().nodes[0].data.assignedToId).toBeNull();

    // QuotaExceededError on store saveCurrentFlowAsNew does not crash
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });
    try {
      let saveRes: { ok: boolean; error?: string } | undefined;
      await act(async () => {
        saveRes = useFlowStore.getState().saveCurrentFlowAsNew('保存テスト');
      });
      expect(saveRes?.ok).toBe(false);
      expect(saveRes?.error).toContain('QuotaExceededError');
      expect(
        useFlowStore.getState().toasts.some((t) => t.type === 'error'),
      ).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
