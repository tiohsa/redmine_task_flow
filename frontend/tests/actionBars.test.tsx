import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBars } from '../src/components/ActionBars';
import { useFlowStore } from '../src/store/useFlowStore';
import type { TaskFlowNode } from '../src/types/flow';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeTaskNode(id: string): TaskFlowNode {
  return {
    id,
    type: 'taskNode',
    position: { x: 0, y: 0 },
    data: {
      subject: `Task ${id}`,
      trackerId: 1,
      statusId: 1,
      priorityId: 2,
      assignedToId: null,
      fixedVersionId: null,
      estimatedHours: null,
      startDate: '2026-11-16',
      dueDate: '2026-11-18',
      lockDates: false,
      description: '',
      customFieldValues: {},
    },
  };
}

describe('ActionBars', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onOpenJsonExport: ReturnType<typeof vi.fn<(jsonText: string) => void>>;
  let onOpenSavedFlows: ReturnType<typeof vi.fn<() => void>>;
  let onToggleFullscreen: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    window.localStorage.clear();
    onOpenJsonExport = vi.fn<(jsonText: string) => void>();
    onOpenSavedFlows = vi.fn<() => void>();
    onToggleFullscreen = vi.fn<() => void>();

    useFlowStore.setState({
      bootstrap: null,
      bulkCreateUrl: '',
      projectIdentifier: 'ec-renewal',
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

    container = document.createElement('div');
    container.className = 'task-flow-root';
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderActionBars(props?: {
    isFullscreen?: boolean;
    omitFullscreen?: boolean;
  }) {
    await act(async () => {
      root.render(
        <ActionBars
          onOpenJsonExport={onOpenJsonExport}
          onOpenSavedFlows={onOpenSavedFlows}
          isFullscreen={props?.isFullscreen}
          onToggleFullscreen={
            props?.omitFullscreen ? undefined : onToggleFullscreen
          }
        />,
      );
    });
  }

  function getButton(ariaLabel: string): HTMLButtonElement {
    const btn = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${ariaLabel}"]`,
    );
    if (!btn) {
      throw new Error(`Button with aria-label="${ariaLabel}" not found`);
    }
    return btn;
  }

  it('renders all icon buttons with aria-labels and downward tooltips', async () => {
    await renderActionBars({ isFullscreen: false });

    const expectedLabels = [
      'タスク追加',
      '親グループ枠',
      '左→右 自動整列',
      '日程自動伝播',
      'Undo',
      'Redo',
      '保存・読込',
      'JSON出力',
      'JSON読込',
      'サンプル初期化',
      'Redmineに一括登録 (0件)',
      '全画面表示',
    ];

    for (const label of expectedLabels) {
      const btn = getButton(label);
      expect(btn.querySelector('svg')).not.toBeNull();
    }

    const dateInput = container.querySelector<HTMLInputElement>(
      'input[type="date"][aria-label="フロー基準日"]',
    );
    expect(dateInput).not.toBeNull();
    expect(dateInput!.value).toBe('2026-11-16');

    const tooltips = Array.from(container.querySelectorAll('[role="tooltip"]'));
    expect(tooltips.length).toBe(13);
    for (const tooltip of tooltips) {
      expect(tooltip.className).toContain('top-full');
      expect(tooltip.className).toContain('mt-2');
      expect(tooltip.className).not.toContain('bottom-full');
    }
  });

  it('shows nodes.length badge and disables Undo/Redo/BulkCreate at boundary states', async () => {
    await renderActionBars();

    expect(getButton('Undo').disabled).toBe(true);
    expect(getButton('Redo').disabled).toBe(true);
    const bulkBtnZero = getButton('Redmineに一括登録 (0件)');
    expect(bulkBtnZero.disabled).toBe(true);
    expect(
      container.querySelector('[data-testid="bulk-create-count-badge"]')
        ?.textContent,
    ).toBe('0');

    await act(async () => {
      useFlowStore.setState({
        nodes: [makeTaskNode('n1'), makeTaskNode('n2')],
        past: [{ nodes: [], edges: [], baseDate: '2026-11-16' }],
        future: [{ nodes: [], edges: [], baseDate: '2026-11-16' }],
      });
    });

    expect(getButton('Undo').disabled).toBe(false);
    expect(getButton('Redo').disabled).toBe(false);
    const bulkBtnTwo = getButton('Redmineに一括登録 (2件)');
    expect(bulkBtnTwo.disabled).toBe(false);
    expect(
      container.querySelector('[data-testid="bulk-create-count-badge"]')
        ?.textContent,
    ).toBe('2');
  });

  it('reflects isSubmitting and isSubmitted states and shows resetFlow button', async () => {
    const resetFlowSpy = vi.fn();
    await act(async () => {
      useFlowStore.setState({
        nodes: [makeTaskNode('n1')],
        isSubmitting: true,
        resetFlow: resetFlowSpy,
      });
    });
    await renderActionBars();

    const submittingBtn = getButton('登録中...');
    expect(submittingBtn.disabled).toBe(true);
    expect(submittingBtn.querySelector('svg.animate-spin')).not.toBeNull();

    await act(async () => {
      useFlowStore.setState({
        isSubmitting: false,
        isSubmitted: true,
        past: [{ nodes: [], edges: [], baseDate: '2026-11-16' }],
        future: [{ nodes: [], edges: [], baseDate: '2026-11-16' }],
      });
    });

    expect(getButton('タスク追加').disabled).toBe(true);
    expect(getButton('親グループ枠').disabled).toBe(true);
    expect(getButton('左→右 自動整列').disabled).toBe(true);
    expect(getButton('日程自動伝播').disabled).toBe(true);
    expect(getButton('Undo').disabled).toBe(true);
    expect(getButton('Redo').disabled).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>(
        'input[type="date"][aria-label="フロー基準日"]',
      )!.disabled,
    ).toBe(true);

    const submittedBtn = getButton('登録完了');
    expect(submittedBtn.disabled).toBe(true);

    // Save/load, JSON actions and fullscreen remain enabled when submitted
    expect(getButton('保存・読込').disabled).toBe(false);
    expect(getButton('JSON出力').disabled).toBe(false);
    expect(getButton('JSON読込').disabled).toBe(false);
    expect(getButton('サンプル初期化').disabled).toBe(false);
    expect(getButton('全画面表示').disabled).toBe(false);

    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('新規フローとしてリセット'),
    );
    expect(resetBtn).toBeDefined();
    expect(resetBtn!.disabled).toBe(false);

    await act(async () => {
      resetBtn!.click();
    });
    expect(resetFlowSpy).toHaveBeenCalledTimes(1);
  });

  it('invokes store actions and callbacks on button clicks and date change', async () => {
    const addTaskNode = vi.fn();
    const addGroupNode = vi.fn();
    const applyAutoLayout = vi.fn();
    const recalculateDates = vi.fn();
    const undo = vi.fn();
    const redo = vi.fn();
    const setBaseDate = vi.fn();
    const submitBulkCreate = vi.fn();
    const exportJson = vi.fn(() => '{"nodes":[]}');
    const resetToSample = vi.fn();

    await act(async () => {
      useFlowStore.setState({
        nodes: [makeTaskNode('n1')],
        past: [{ nodes: [], edges: [], baseDate: '2026-11-16' }],
        future: [{ nodes: [], edges: [], baseDate: '2026-11-16' }],
        addTaskNode,
        addGroupNode,
        applyAutoLayout,
        recalculateDates,
        undo,
        redo,
        setBaseDate,
        submitBulkCreate,
        exportJson,
        resetToSample,
      });
    });

    await renderActionBars({ isFullscreen: false });

    await act(async () => {
      getButton('タスク追加').click();
      getButton('親グループ枠').click();
      getButton('左→右 自動整列').click();
      getButton('日程自動伝播').click();
      getButton('Undo').click();
      getButton('Redo').click();
      getButton('保存・読込').click();
      getButton('JSON出力').click();
      getButton('サンプル初期化').click();
      getButton('Redmineに一括登録 (1件)').click();
      getButton('全画面表示').click();
    });

    expect(addTaskNode).toHaveBeenCalledTimes(1);
    expect(addGroupNode).toHaveBeenCalledTimes(1);
    expect(applyAutoLayout).toHaveBeenCalledTimes(1);
    expect(recalculateDates).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(onOpenSavedFlows).toHaveBeenCalledTimes(1);
    expect(exportJson).toHaveBeenCalledTimes(1);
    expect(onOpenJsonExport).toHaveBeenCalledWith('{"nodes":[]}');
    expect(resetToSample).toHaveBeenCalledTimes(1);
    expect(submitBulkCreate).toHaveBeenCalledTimes(1);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('toggles fullscreen button attributes and omits it when onToggleFullscreen is not provided', async () => {
    await renderActionBars({ isFullscreen: true });
    const exitBtn = getButton('全画面解除');
    expect(exitBtn.getAttribute('aria-pressed')).toBe('true');

    await renderActionBars({ omitFullscreen: true });
    expect(container.querySelector('button[aria-pressed]')).toBeNull();
  });
});
