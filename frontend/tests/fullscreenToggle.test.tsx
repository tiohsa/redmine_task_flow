import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import * as client from '../src/api/client';
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

describe('Fullscreen Toggle (App + ActionBars)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchBootstrapSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    window.localStorage.clear();
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
    });

    fetchBootstrapSpy = vi
      .spyOn(client, 'fetchBootstrap')
      .mockResolvedValue(MOCK_BOOTSTRAP);

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
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function getToggleButton(): HTMLButtonElement {
    const btn = container.querySelector<HTMLButtonElement>(
      'button[aria-pressed]',
    );
    if (!btn) {
      throw new Error('Fullscreen toggle button not found');
    }
    return btn;
  }

  function getEditorContainer(): HTMLDivElement {
    const el = container.querySelector<HTMLDivElement>(
      '[data-testid="task-flow-editor-container"]',
    );
    if (!el) {
      throw new Error('Editor container not found');
    }
    return el;
  }

  it('toggles fullscreen ON and OFF with aria-pressed and CSS layout classes without persisting to localStorage', async () => {
    const editor = getEditorContainer();
    let btn = getToggleButton();

    expect(editor.dataset.fullscreen).toBe('false');
    expect(editor.className).toContain('relative');
    expect(editor.classList.contains('task-flow-fullscreen')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.textContent).toContain('全画面');

    const keysBefore = Object.keys(window.localStorage);

    await act(async () => {
      btn.click();
    });

    btn = getToggleButton();
    expect(editor.dataset.fullscreen).toBe('true');
    expect(editor.className).toContain('fixed');
    expect(editor.className).toContain('inset-0');
    expect(editor.classList.contains('task-flow-fullscreen')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toContain('全画面解除');

    // Should not persist fullscreen state to localStorage
    expect(Object.keys(window.localStorage)).toEqual(keysBefore);

    await act(async () => {
      btn.click();
    });

    btn = getToggleButton();
    expect(editor.dataset.fullscreen).toBe('false');
    expect(editor.className).toContain('relative');
    expect(editor.className).not.toContain('fixed');
    expect(editor.classList.contains('task-flow-fullscreen')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('exits fullscreen when pressing Escape outside editable elements and modals', async () => {
    const editor = getEditorContainer();

    await act(async () => {
      getToggleButton().click();
    });
    expect(editor.dataset.fullscreen).toBe('true');

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(editor.dataset.fullscreen).toBe('false');
    expect(getToggleButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('does NOT exit fullscreen on Escape when focus is on input, textarea, select, or contentEditable', async () => {
    const editor = getEditorContainer();

    await act(async () => {
      getToggleButton().click();
    });
    expect(editor.dataset.fullscreen).toBe('true');

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editableDiv = document.createElement('div');
    editableDiv.contentEditable = 'true';
    Object.defineProperty(editableDiv, 'isContentEditable', { value: true });

    container.append(input, textarea, select, editableDiv);

    for (const target of [input, textarea, select, editableDiv]) {
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      });
      expect(editor.dataset.fullscreen).toBe('true');
    }
  });

  it('does NOT exit fullscreen on Escape when ResultModal or JSON export modal is open', async () => {
    const editor = getEditorContainer();

    await act(async () => {
      getToggleButton().click();
    });
    expect(editor.dataset.fullscreen).toBe('true');

    // Case 1: ResultModal is open
    await act(async () => {
      useFlowStore.setState({
        resultModalOpen: true,
        resultModalMode: 'success',
      });
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(editor.dataset.fullscreen).toBe('true');

    // Close ResultModal
    await act(async () => {
      useFlowStore.getState().closeResultModal();
    });

    // Case 2: JSON export modal is open
    const jsonExportBtn = Array.from(
      container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('JSON出力'));
    expect(jsonExportBtn).toBeTruthy();

    await act(async () => {
      jsonExportBtn!.click();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(editor.dataset.fullscreen).toBe('true');
  });

  it('preserves nodes, edges, selection, Undo/Redo history, and does not re-fetch bootstrap on toggle', async () => {
    expect(fetchBootstrapSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      const store = useFlowStore.getState();
      const id1 = store.addTaskNode({ position: { x: 10, y: 20 } });
      const id2 = store.addTaskNode({ position: { x: 300, y: 20 } });
      store.connectNodes({
        source: id1,
        target: id2,
        sourceHandle: null,
        targetHandle: null,
      });
      store.selectNode(id1);
      store.undo();
    });

    const beforeState = useFlowStore.getState();
    const beforeNodes = beforeState.nodes;
    const beforeEdges = beforeState.edges;
    const beforeSelectedNodeId = beforeState.selectedNodeId;
    const beforePastLen = beforeState.past.length;
    const beforeFutureLen = beforeState.future.length;

    expect(beforePastLen).toBeGreaterThan(0);
    expect(beforeFutureLen).toBeGreaterThan(0);

    // Toggle ON then OFF
    await act(async () => {
      getToggleButton().click();
    });
    await act(async () => {
      getToggleButton().click();
    });

    const afterState = useFlowStore.getState();
    expect(afterState.nodes).toBe(beforeNodes);
    expect(afterState.edges).toBe(beforeEdges);
    expect(afterState.selectedNodeId).toBe(beforeSelectedNodeId);
    expect(afterState.past.length).toBe(beforePastLen);
    expect(afterState.future.length).toBe(beforeFutureLen);
    expect(fetchBootstrapSpy).toHaveBeenCalledTimes(1);
  });

  it('remains enabled and functional when isSubmitted is true', async () => {
    await act(async () => {
      useFlowStore.setState({ isSubmitted: true });
    });

    const btn = getToggleButton();
    const editor = getEditorContainer();

    expect(btn.disabled).toBe(false);
    expect(editor.dataset.fullscreen).toBe('false');

    await act(async () => {
      btn.click();
    });

    expect(editor.dataset.fullscreen).toBe('true');
    expect(getToggleButton().getAttribute('aria-pressed')).toBe('true');
  });
});
