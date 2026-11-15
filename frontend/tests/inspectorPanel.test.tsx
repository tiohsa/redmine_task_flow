import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectorPanel } from '../src/components/InspectorPanel';
import { useFlowStore } from '../src/store/useFlowStore';
import type { BootstrapData } from '../src/types/flow';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MOCK_BOOTSTRAP: BootstrapData = {
  project: { id: 12, identifier: 'ec-renewal', name: 'ECサイトリニューアル基盤' },
  trackers: [
    {
      id: 1,
      name: '機能',
      default_status_id: 1,
      allowed_status_ids: [1, 2],
      disabled_core_fields: [],
      custom_fields: [],
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

function resetStore() {
  window.localStorage.clear();
  useFlowStore.setState({
    bootstrap: MOCK_BOOTSTRAP,
    bulkCreateUrl: '/projects/ec-renewal/task_flow/bulk_create.json',
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
    focusSubjectSeq: 0,
    isInspectorCollapsed: false,
  });
}

describe('useFlowStore inspector collapse state (unit)', () => {
  beforeEach(resetStore);

  it('defaults to expanded and toggles via actions', () => {
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(false);

    useFlowStore.getState().toggleInspectorCollapsed();
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(true);

    useFlowStore.getState().toggleInspectorCollapsed();
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(false);

    useFlowStore.getState().setInspectorCollapsed(true);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(true);
  });

  it('auto-expands on focusSubjectSeq increment (triggerFocusSubject, addTaskNode, addGroupNode) but NOT on selectNode/selectEdge', () => {
    const id1 = useFlowStore.getState().addTaskNode({ position: { x: 0, y: 0 } });
    const id2 = useFlowStore.getState().addTaskNode({ position: { x: 300, y: 0 } });
    const conn = useFlowStore.getState().connectNodes({
      source: id1,
      target: id2,
      sourceHandle: null,
      targetHandle: null,
    });
    expect(conn.ok).toBe(true);
    const edgeId = useFlowStore.getState().edges[0].id;

    // Collapse the panel
    useFlowStore.getState().setInspectorCollapsed(true);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(true);

    // Simple click selection must NOT auto-expand
    useFlowStore.getState().selectNode(id1);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(true);

    useFlowStore.getState().selectEdge(edgeId);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(true);

    // triggerFocusSubject (e.g. double-click) MUST auto-expand and increment focusSubjectSeq
    const prevSeq = useFlowStore.getState().focusSubjectSeq;
    useFlowStore.getState().selectNode(id1);
    useFlowStore.getState().triggerFocusSubject();
    expect(useFlowStore.getState().focusSubjectSeq).toBe(prevSeq + 1);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(false);

    // addTaskNode while collapsed MUST auto-expand
    useFlowStore.getState().setInspectorCollapsed(true);
    const seqBeforeTask = useFlowStore.getState().focusSubjectSeq;
    useFlowStore.getState().addTaskNode({ position: { x: 100, y: 200 } });
    expect(useFlowStore.getState().focusSubjectSeq).toBe(seqBeforeTask + 1);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(false);

    // addGroupNode while collapsed MUST auto-expand
    useFlowStore.getState().setInspectorCollapsed(true);
    const seqBeforeGroup = useFlowStore.getState().focusSubjectSeq;
    useFlowStore.getState().addGroupNode({ x: 50, y: 50 });
    expect(useFlowStore.getState().focusSubjectSeq).toBe(seqBeforeGroup + 1);
    expect(useFlowStore.getState().isInspectorCollapsed).toBe(false);
  });
});

describe('InspectorPanel component (integration)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const renderPanel = () => {
    act(() => {
      root.render(<InspectorPanel />);
    });
  };

  const getToggleButton = (): HTMLButtonElement => {
    const btn = container.querySelector('aside button[aria-expanded]');
    expect(btn).not.toBeNull();
    return btn as HTMLButtonElement;
  };

  it('renders expanded by default with aria-expanded="true", collapses to slim strip, and re-expands preserving selection and values', () => {
    const nodeId = useFlowStore.getState().addTaskNode({ position: { x: 10, y: 10 } });
    useFlowStore.getState().updateNodeData(nodeId, {
      subject: '決済API実装',
      description: 'テスト仕様書を確認',
    });

    renderPanel();

    // Initial expanded state
    const asideExpanded = container.querySelector('aside')!;
    expect(asideExpanded.className).toContain('w-80');
    expect(asideExpanded.className).toContain('sm:w-96');

    const collapseBtn = getToggleButton();
    expect(collapseBtn.getAttribute('aria-expanded')).toBe('true');
    expect(collapseBtn.getAttribute('aria-label')).toBeTruthy();
    expect(container.querySelector('#field-subject')).not.toBeNull();

    // Click to collapse
    act(() => {
      collapseBtn.click();
    });

    const asideCollapsed = container.querySelector('aside')!;
    expect(asideCollapsed.className).toContain('w-10');
    expect(asideCollapsed.className).not.toContain('w-80');
    expect(container.querySelector('#field-subject')).toBeNull();

    const expandBtn = getToggleButton();
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
    expect(expandBtn.getAttribute('aria-label')).toBeTruthy();

    // Click to re-expand
    act(() => {
      expandBtn.click();
    });

    const asideReexpanded = container.querySelector('aside')!;
    expect(asideReexpanded.className).toContain('w-80');
    expect(asideReexpanded.className).toContain('sm:w-96');
    expect(getToggleButton().getAttribute('aria-expanded')).toBe('true');

    const subjectInput = container.querySelector('#field-subject') as HTMLInputElement;
    const descInput = container.querySelector('#field-description') as HTMLTextAreaElement;
    expect(subjectInput.value).toBe('決済API実装');
    expect(descInput.value).toBe('テスト仕様書を確認');
  });

  it('auto-expands and focuses subject input on focusSubjectSeq increment, but stays collapsed on simple click-selection', () => {
    const nodeId = useFlowStore.getState().addTaskNode({ position: { x: 10, y: 10 } });
    renderPanel();

    // Collapse panel
    act(() => {
      getToggleButton().click();
    });
    expect(getToggleButton().getAttribute('aria-expanded')).toBe('false');

    // Simple click selection should NOT expand
    act(() => {
      useFlowStore.getState().clearSelection();
      useFlowStore.getState().selectNode(nodeId);
    });
    expect(getToggleButton().getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#field-subject')).toBeNull();

    // Double-click / triggerFocusSubject MUST auto-expand and focus subject input
    act(() => {
      useFlowStore.getState().triggerFocusSubject();
    });
    expect(getToggleButton().getAttribute('aria-expanded')).toBe('true');
    const subjectInput = container.querySelector('#field-subject') as HTMLInputElement;
    expect(subjectInput).not.toBeNull();
    expect(document.activeElement).toBe(subjectInput);
  });

  it('remains operable in submitted and validation error states without losing values, errors, or undo/redo history', () => {
    const nodeId = useFlowStore.getState().addTaskNode({ position: { x: 10, y: 10 } });
    useFlowStore.getState().updateNodeData(nodeId, { subject: 'エラー対象タスク' });
    useFlowStore.getState().undo();
    useFlowStore.getState().redo();
    useFlowStore.getState().selectNode(nodeId);

    const pastBefore = useFlowStore.getState().past.length;
    const futureBefore = useFlowStore.getState().future.length;

    act(() => {
      useFlowStore.setState({
        isSubmitted: true,
        validationErrors: { [nodeId]: ['サーバー側エラーメッセージ'] },
      });
    });

    renderPanel();

    const collapseBtn = getToggleButton();
    expect(collapseBtn.disabled).toBe(false);
    expect(container.textContent).toContain('サーバー側エラーメッセージ');

    // Collapse while submitted & error present
    act(() => {
      collapseBtn.click();
    });
    expect(getToggleButton().getAttribute('aria-expanded')).toBe('false');
    expect(getToggleButton().disabled).toBe(false);

    // Re-expand
    act(() => {
      getToggleButton().click();
    });
    expect(getToggleButton().getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('サーバー側エラーメッセージ');
    expect((container.querySelector('#field-subject') as HTMLInputElement).value).toBe(
      'エラー対象タスク',
    );
    expect(useFlowStore.getState().past.length).toBe(pastBefore);
    expect(useFlowStore.getState().future.length).toBe(futureBefore);
  });

  it('stops click event propagation on the toggle button', () => {
    const parentClickSpy = vi.fn();
    act(() => {
      root.render(
        <div onClick={parentClickSpy}>
          <InspectorPanel />
        </div>,
      );
    });

    act(() => {
      getToggleButton().click();
    });
    expect(parentClickSpy).not.toHaveBeenCalled();

    act(() => {
      getToggleButton().click();
    });
    expect(parentClickSpy).not.toHaveBeenCalled();
  });

  it('applies responsive width, min-h-0 scroll container, min-w-0 grid children, pr-7 on selects, and bg-white on inputs in node view', () => {
    const customBootstrap: BootstrapData = {
      ...MOCK_BOOTSTRAP,
      trackers: [
        {
          ...MOCK_BOOTSTRAP.trackers[0],
          custom_fields: [
            {
              id: 101,
              name: '種別リスト',
              field_format: 'list',
              is_required: false,
              possible_values: ['A', 'B'],
              default_value: '',
            },
            {
              id: 102,
              name: '承認済み',
              field_format: 'bool',
              is_required: false,
              default_value: '',
            },
          ],
        },
      ],
    };

    useFlowStore.setState({ bootstrap: customBootstrap });
    useFlowStore.getState().addTaskNode({ position: { x: 10, y: 10 } });
    renderPanel();

    const aside = container.querySelector('aside')!;
    expect(aside.className).toContain('w-80');
    expect(aside.className).toContain('max-w-full');
    expect(aside.className).toContain('sm:w-96');
    expect(aside.className).toContain('lg:w-[420px]');
    expect(aside.className).toContain('xl:w-[460px]');

    const scrollContainer = aside.querySelector('div.overflow-y-auto')!;
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer.className).toContain('flex-1');
    expect(scrollContainer.className).toContain('min-h-0');

    // Every child div inside grid-cols-2 / sm:grid-cols-2 containers has min-w-0
    const grids = scrollContainer.querySelectorAll('.grid');
    expect(grids.length).toBe(4);
    grids.forEach((grid) => {
      Array.from(grid.children).forEach((child) => {
        expect(child.className).toContain('min-w-0');
      });
    });

    // Schedule dates grid uses grid-cols-1 sm:grid-cols-2
    const datesGrid = container.querySelector('#field-start-date')?.closest('.grid');
    expect(datesGrid).not.toBeNull();
    expect(datesGrid!.className).toContain('grid-cols-1');
    expect(datesGrid!.className).toContain('sm:grid-cols-2');

    // All selects (5 standard + 2 custom) have pl-2.5 pr-7 and not px-2.5
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(7);
    selects.forEach((select) => {
      expect(select.className).toContain('pl-2.5');
      expect(select.className).toContain('pr-7');
      expect(select.className).not.toContain('px-2.5');
    });

    // Text/number/textarea inputs have bg-white and disabled:bg-slate-100
    ['#field-subject', '#field-estimated-hours', '#field-description'].forEach(
      (selector) => {
        const el = container.querySelector(selector)!;
        expect(el).not.toBeNull();
        expect(el.className).toContain('bg-white');
        expect(el.className).toContain('disabled:bg-slate-100');
      },
    );
  });

  it('applies min-h-0 scroll container and bg-white on edge-delay-input in edge view', () => {
    const id1 = useFlowStore.getState().addTaskNode({ position: { x: 0, y: 0 } });
    const id2 = useFlowStore.getState().addTaskNode({ position: { x: 200, y: 0 } });
    useFlowStore.getState().connectNodes({
      source: id1,
      target: id2,
      sourceHandle: null,
      targetHandle: null,
    });
    const edgeId = useFlowStore.getState().edges[0].id;
    useFlowStore.getState().selectEdge(edgeId);

    renderPanel();

    const aside = container.querySelector('aside')!;
    const scrollContainer = aside.querySelector('div.overflow-y-auto')!;
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer.className).toContain('flex-1');
    expect(scrollContainer.className).toContain('min-h-0');

    const delayInput = container.querySelector('#edge-delay-input')!;
    expect(delayInput).not.toBeNull();
    expect(delayInput.className).toContain('bg-white');
    expect(delayInput.className).toContain('disabled:bg-slate-100');
  });
});
