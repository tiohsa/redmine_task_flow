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
});
