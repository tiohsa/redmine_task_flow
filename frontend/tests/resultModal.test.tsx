import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultModal } from '../src/components/ResultModal';
import {
  TASK_FLOW_JSON_SCHEMA,
  TASK_FLOW_JSON_SCHEMA_TEXT,
} from '../src/domain/flowJsonSchema';
import { useFlowStore } from '../src/store/useFlowStore';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_JSON = JSON.stringify(
  {
    schema_version: 1,
    baseDate: '2026-11-16',
    nodes: [],
    edges: [],
  },
  null,
  2,
);

function resetStoreState() {
  useFlowStore.setState({
    nodes: [],
    edges: [],
    createdIssuesMap: {},
    validationErrors: {},
    submitErrorMessages: [],
    resultModalOpen: false,
    resultModalMode: null,
    toasts: [],
  });
}

describe('ResultModal JSON Export & Schema Viewer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStoreState();
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

  it('provides valid JSON Schema text matching SerializedFlowData structure', () => {
    const parsed = JSON.parse(TASK_FLOW_JSON_SCHEMA_TEXT) as typeof TASK_FLOW_JSON_SCHEMA;
    expect(parsed.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(parsed.required).toEqual(['schema_version', 'baseDate', 'nodes', 'edges']);
    expect(parsed.properties.schema_version.const).toBe(1);
    expect(parsed.$defs.TaskFlowNode.properties.type.enum).toEqual([
      'taskNode',
      'groupNode',
    ]);
    expect(parsed.$defs.TaskFlowEdge.properties.type.enum).toEqual([
      'dependencyEdge',
    ]);
  });

  it('toggles between exported JSON and JSON schema definition', () => {
    act(() => {
      root.render(<ResultModal jsonText={SAMPLE_JSON} onClose={vi.fn()} />);
    });

    expect(
      container.querySelector('[data-testid="json-export-preview"]')?.textContent,
    ).toBe(SAMPLE_JSON);
    expect(
      container.querySelector('[data-testid="json-schema-preview"]'),
    ).toBeNull();

    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('スキーマ定義を表示'),
    );
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn?.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      toggleBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="json-export-preview"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="json-schema-preview"]')?.textContent,
    ).toBe(TASK_FLOW_JSON_SCHEMA_TEXT);
    expect(toggleBtn?.textContent).toContain('出力JSONに戻る');
    expect(toggleBtn?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      toggleBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="json-export-preview"]')?.textContent,
    ).toBe(SAMPLE_JSON);
    expect(
      container.querySelector('[data-testid="json-schema-preview"]'),
    ).toBeNull();
  });

  it('copies schema definition via copy icon button and shows success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    act(() => {
      root.render(<ResultModal jsonText={SAMPLE_JSON} onClose={vi.fn()} />);
    });

    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('スキーマ定義を表示'),
    );
    act(() => {
      toggleBtn!.click();
    });

    const copySchemaBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="スキーマ定義をコピー"]',
    );
    expect(copySchemaBtn).not.toBeNull();

    await act(async () => {
      copySchemaBtn!.click();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(TASK_FLOW_JSON_SCHEMA_TEXT);

    const toasts = useFlowStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].message).toBe('スキーマ定義をクリップボードにコピーしました');
  });

  it('shows warning toast when clipboard copy fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    act(() => {
      root.render(<ResultModal jsonText={SAMPLE_JSON} onClose={vi.fn()} />);
    });

    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('スキーマ定義を表示'),
    );
    act(() => {
      toggleBtn!.click();
    });

    const copySchemaBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="スキーマ定義をコピー"]',
    );
    await act(async () => {
      copySchemaBtn!.click();
    });

    const toasts = useFlowStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('warning');
    expect(toasts[0].message).toBe('クリップボードへのコピーに失敗しました');
  });

  it('resets view back to exported JSON when modal closes and reopens', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(<ResultModal jsonText={SAMPLE_JSON} onClose={onClose} />);
    });

    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('スキーマ定義を表示'),
    );
    act(() => {
      toggleBtn!.click();
    });
    expect(
      container.querySelector('[data-testid="json-schema-preview"]'),
    ).not.toBeNull();

    // Close modal (jsonText becomes null)
    act(() => {
      root.render(<ResultModal jsonText={null} onClose={onClose} />);
    });

    // Reopen modal
    act(() => {
      root.render(<ResultModal jsonText={SAMPLE_JSON} onClose={onClose} />);
    });

    expect(
      container.querySelector('[data-testid="json-export-preview"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="json-schema-preview"]'),
    ).toBeNull();
  });

  it('keeps existing JSON copy button working', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    act(() => {
      root.render(<ResultModal jsonText={SAMPLE_JSON} onClose={vi.fn()} />);
    });

    const copyJsonBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'JSONをコピー',
    );
    expect(copyJsonBtn).toBeDefined();

    await act(async () => {
      copyJsonBtn!.click();
    });

    expect(writeText).toHaveBeenCalledWith(SAMPLE_JSON);
    const toasts = useFlowStore.getState().toasts;
    expect(toasts[0]).toMatchObject({
      type: 'success',
      message: 'JSON をクリップボードにコピーしました',
    });
  });
});
