import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { getDraftStorageKey } from '../src/domain/persistence';
import { useFlowStore } from '../src/store/useFlowStore';
import { bootstrap, setupFlow, task } from './bulkNodeEditFixture';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  setupFlow();
  vi.stubGlobal('fetch', async () => Response.json(bootstrap));
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
      close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; } },
    });
  }
  if (!globalThis.ResizeObserver) {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  }
  container = document.createElement('div');
  container.className = 'task-flow-root';
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App bootstrapUrl="/bootstrap.json" bulkCreateUrl="/bulk_create.json" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const opener = () => container.querySelector<HTMLButtonElement>('button[aria-label="属性を一括変更"]')!;
const dialog = () => container.querySelector<HTMLDialogElement>('dialog')!;
const button = (text: string) => Array.from(dialog().querySelectorAll('button')).find((item) => item.textContent === text)!;
const boxes = () => Array.from(dialog().querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
const selectField = (field: string) => Array.from(dialog().querySelectorAll('select')).find((item) => item.labels?.[0].textContent === field)!;
const choose = (field: string, value: string) => act(() => {
  const select = selectField(field);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
const click = (element: HTMLElement) => act(() => element.click());

function importNodes(nodes: ReturnType<typeof task>[]) {
  act(() => useFlowStore.getState().importJson(JSON.stringify({
    schema_version: 1, nodes, edges: [], baseDate: '2026-11-16',
  })));
}

function savedEditState() {
  const { nodes, past, future } = useFlowStore.getState();
  const draftKey = getDraftStorageKey(bootstrap.project.id, bootstrap.current_user_id);
  return structuredClone({ nodes, past, future, draft: localStorage.getItem(draftKey) });
}

it('BNE-05 opens only in an eligible flow and cancellation discards the form', () => {
  click(opener());
  expect(dialog().open).toBe(true);
  expect(button('適用').disabled).toBe(true);
  click(boxes()[0]);
  expect(button('適用').disabled).toBe(true);
  click(button('取消'));
  expect(dialog().open).toBe(false);
  click(opener());
  expect(boxes().map((box) => box.checked)).toEqual([false, false]);
});

it('BNE-05 disables the toolbar for zero or one nodes', () => {
  act(() => useFlowStore.setState({ nodes: [] }));
  expect(opener().disabled).toBe(true);
  act(() => useFlowStore.setState({ nodes: [task('A')] }));
  expect(opener().disabled).toBe(true);
});

it('BNE-05 reports zero selections and disables apply after clearing every selection', () => {
  click(opener());
  boxes().forEach(click);
  choose('優先度', '2');
  expect(button('適用').disabled).toBe(false);
  boxes().forEach(click);
  expect(dialog().textContent).toContain('選択 0 件 / 上限 100 件');
  expect(button('適用').disabled).toBe(true);
});

it('BNE-05 keeps the graph, history and stored draft when cancelling a valid edit', () => {
  const before = savedEditState();
  expect(before.draft).toContain('"schema_version":1');
  click(opener());
  boxes().forEach(click);
  choose('優先度', '2');
  expect(button('適用').disabled).toBe(false);
  click(button('取消'));
  expect(dialog().open).toBe(false);
  expect(savedEditState()).toEqual(before);
});

it('BNE-01 applies to checked nodes through the toolbar form', () => {
  click(opener());
  expect(Array.from(dialog().querySelectorAll('select')).map((item) => item.labels?.[0].textContent)).toEqual([
    'トラッカー', '優先度', '担当者', '対象バージョン',
  ]);
  boxes().forEach(click);
  choose('優先度', '2');
  click(button('適用'));
  expect(dialog().open).toBe(false);
  expect(useFlowStore.getState().nodes.map(({ data }) => data.priorityId)).toEqual([2, 2]);
});

it('BNE-02 explicitly clears the assignee and version without changing priority', () => {
  importNodes([
    task('A', { assignedToId: 10, fixedVersionId: 5 }),
    task('B', { assignedToId: null, fixedVersionId: null, priorityId: 2 }),
  ]);
  click(opener());
  boxes().forEach(click);
  expect(selectField('担当者').selectedOptions[0].textContent).toBe('変更しない');
  expect(selectField('対象バージョン').selectedOptions[0].textContent).toBe('変更しない');
  choose('担当者', 'clear');
  choose('対象バージョン', 'clear');
  expect(selectField('担当者').selectedOptions[0].textContent).toBe('未割当');
  expect(selectField('対象バージョン').selectedOptions[0].textContent).toBe('なし');
  click(button('適用'));
  expect(useFlowStore.getState().nodes.map(({ data }) => [data.assignedToId, data.fixedVersionId, data.priorityId]))
    .toEqual([[null, null, 1], [null, null, 2]]);
});

it('BNE-03 keeps a newly invalid choice visible until corrected', () => {
  click(opener());
  boxes().forEach(click);
  choose('担当者', '10');
  choose('トラッカー', '3');
  expect(button('適用').disabled).toBe(true);
  expect(dialog().textContent).toContain('担当者欄は無効');
  choose('担当者', '');
  expect(button('適用').disabled).toBe(false);
});

it('BNE-03 updates assignee and version options as selected nodes and the target tracker change', () => {
  importNodes([task('A'), task('B'), task('C', { trackerId: 3 })]);
  click(opener());
  boxes().slice(0, 2).forEach(click);
  const candidateValues = () => ['担当者', '対象バージョン'].map((field) =>
    Array.from(selectField(field).options, ({ value }) => value));
  expect(candidateValues()).toEqual([['', 'clear', '10'], ['', 'clear', '5']]);
  click(boxes()[2]);
  expect(candidateValues()).toEqual([[''], ['']]);
  choose('トラッカー', '2');
  expect(candidateValues()).toEqual([['', 'clear', '10'], ['', 'clear', '5']]);
  choose('トラッカー', '');
  click(boxes()[2]);
  expect(candidateValues()).toEqual([['', 'clear', '10'], ['', 'clear', '5']]);
});

it('BNE-04 names the node whose status cannot be kept and blocks the full edit', () => {
  importNodes([task('進行中のタスク', { statusId: 2 }), task('新規タスク')]);
  click(opener());
  boxes().forEach(click);
  choose('トラッカー', '3');
  expect(dialog().textContent).toContain('進行中のタスク：変更先で現在のステータスを維持できません');
  expect(button('適用').disabled).toBe(true);
  choose('トラッカー', '2');
  click(button('適用'));
  expect(useFlowStore.getState().nodes.map(({ data }) => [data.trackerId, data.statusId]))
    .toEqual([[2, 2], [2, 1]]);
});

it('BNE-04 keeps the status reason visible when only the incompatible node remains', () => {
  importNodes([task('A'), task('B', { statusId: 2 })]);
  click(opener());
  boxes().forEach(click);
  choose('トラッカー', '3');
  click(boxes()[0]);
  expect(dialog().textContent).toContain('対象を 2 件以上選択してください');
  expect(dialog().textContent).toContain('B：変更先で現在のステータスを維持できません');
  expect(button('適用').disabled).toBe(true);
  click(boxes()[0]);
  choose('トラッカー', '2');
  click(button('適用'));
  expect(dialog().open).toBe(false);
  expect(useFlowStore.getState().nodes.map(({ data }) => data.trackerId)).toEqual([2, 2]);
});

it('BNE-08 reports 101 selected nodes and applies after correcting the selection to 100', () => {
  importNodes([
    { ...task('親'), type: 'groupNode' },
    ...Array.from({ length: 100 }, (_, index) => task(`タスク ${index + 1}`)),
  ]);
  click(opener());
  boxes().forEach(click);
  choose('優先度', '2');
  expect(dialog().textContent).toContain('選択 101 件 / 上限 100 件');
  expect(button('適用').disabled).toBe(true);
  click(boxes()[100]);
  expect(dialog().textContent).toContain('選択 100 件 / 上限 100 件');
  click(button('適用'));
  expect(dialog().open).toBe(false);
  expect(useFlowStore.getState().nodes.map(({ data }) => data.priorityId))
    .toEqual([...Array<number>(100).fill(2), 1]);
});

it('BNE-10 identifies a disappeared selection and can apply after removing it', () => {
  importNodes([task('A'), task('B'), task('C')]);
  click(opener());
  boxes().forEach(click);
  choose('優先度', '2');
  act(() => {
    useFlowStore.getState().selectNode('A');
    useFlowStore.getState().deleteSelected();
  });
  expect(dialog().textContent).toContain('A：対象ノードが見つかりません');
  expect(button('適用').disabled).toBe(true);
  click(boxes().find((box) => box.labels?.[0].textContent === '見つからない対象（A）')!);
  expect(button('適用').disabled).toBe(false);
  click(button('適用'));
  expect(dialog().open).toBe(false);
  expect(useFlowStore.getState().nodes.map(({ id, data }) => [id, data.priorityId])).toEqual([['B', 2], ['C', 2]]);
});

it('BNE-10 keeps the edit available after draft storage fails', () => {
  click(opener());
  boxes().forEach(click);
  choose('優先度', '2');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('保存容量が不足しています', 'QuotaExceededError');
  });
  click(button('適用'));
  expect(dialog().open).toBe(true);
  expect(dialog().textContent).toContain('保存容量が不足しています');
  expect(boxes().map((box) => box.checked)).toEqual([true, true]);
  click(button('適用'));
  expect(dialog().open).toBe(false);
  expect(useFlowStore.getState().nodes.map(({ data }) => data.priorityId)).toEqual([2, 2]);
});

it('BNE-10 shows the current validation issue after an earlier draft write failure', () => {
  click(opener());
  boxes().forEach(click);
  choose('トラッカー', '3');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('保存容量が不足しています', 'QuotaExceededError');
  });
  click(button('適用'));
  expect(dialog().textContent).toContain('保存容量が不足しています');
  act(() => useFlowStore.getState().updateNodeData('B', { statusId: 2 }));
  expect(dialog().textContent).toContain('B：変更先で現在のステータスを維持できません');
  expect(button('適用').disabled).toBe(true);
});

it('BNE-10 rechecks the latest node state when applying a valid preview', () => {
  click(opener());
  boxes().forEach(click);
  choose('トラッカー', '3');
  const apply = button('適用');
  expect(apply.disabled).toBe(false);
  act(() => {
    useFlowStore.getState().updateNodeData('B', { statusId: 2 });
    apply.click();
  });
  expect(dialog().open).toBe(true);
  expect(selectField('トラッカー').value).toBe('3');
  expect(useFlowStore.getState().nodes.map(({ data }) => data.trackerId)).toEqual([1, 1]);
  expect(dialog().textContent).toContain('B：変更先で現在のステータスを維持できません');
});

it('renders parent, child, tracker, and assignee badges on node cards', () => {
  importNodes([
    { ...task('親フェーズ', { estimatedHours: 16 }), type: 'groupNode' },
    { ...task('子タスク', { trackerId: 2, assignedToId: 10, estimatedHours: 8 }), parentId: '親フェーズ' },
  ]);
  click(opener());
  expect(dialog().textContent).toContain('親チケット');
  expect(dialog().textContent).toContain('子');
  expect(dialog().textContent).toContain('新しいトラッカー');
  expect(dialog().textContent).toContain('作業者');
});

it('supports select all, deselect all, and the header close button', () => {
  click(opener());
  click(button('すべて選択'));
  expect(boxes().map((box) => box.checked)).toEqual([true, true]);
  expect(dialog().textContent).toContain('選択 2 件 / 上限 100 件');

  click(button('解除'));
  expect(boxes().map((box) => box.checked)).toEqual([false, false]);

  click(dialog().querySelector<HTMLButtonElement>('button[aria-label="閉じる"]')!);
  expect(dialog().open).toBe(false);
});
