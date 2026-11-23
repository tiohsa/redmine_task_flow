import type { BootstrapData, TaskFlowNode, TrackerMeta } from '../../../../types/flow';

export const MAX_BULK_NODE_EDIT_SELECTION = 100;

export interface BulkNodeEditChanges {
  trackerId?: number;
  priorityId?: number;
  assignedToId?: number | null;
  fixedVersionId?: number | null;
}

export interface BulkNodeEditRequest {
  nodeIds: readonly string[];
  changes: BulkNodeEditChanges;
}

type Field = keyof BulkNodeEditChanges;
type Candidate = { id: number; name: string };
type Candidates = Record<Field, readonly Candidate[] | null>;

export interface BulkNodeEditIssue {
  message: string;
  nodeId?: string;
  field?: Field;
}

export interface BulkNodeEditFailure {
  ok: false;
  issues: BulkNodeEditIssue[];
}

export type BulkNodeEditResult =
  | { ok: true; nodes: TaskFlowNode[]; changedNodeIds: string[] }
  | BulkNodeEditFailure;

const attributes = {
  trackerId: 'トラッカー',
  priorityId: '優先度',
  assignedToId: '担当者',
  fixedVersionId: '対象バージョン',
} satisfies Record<Field, string>;
const fields = Object.keys(attributes) as Field[];

function restrictField(
  field: 'assignedToId' | 'fixedVersionId',
  disabledKey: string,
  trackers: ReadonlyMap<string, TrackerMeta | undefined>,
  options: readonly Candidate[],
  changes: BulkNodeEditChanges,
  issues: BulkNodeEditIssue[],
): readonly Candidate[] | null {
  const blocked = [...trackers].find(([, tracker]) => !tracker || tracker.disabled_core_fields.includes(disabledKey));
  if (!blocked) return options;
  if (changes[field] !== undefined) {
    issues.push({ field, nodeId: blocked[0], message: `${attributes[field]}欄は無効です` });
  }
  return null;
}

export function evaluateBulkNodeEdit(
  nodes: readonly TaskFlowNode[],
  bootstrap: BootstrapData,
  { nodeIds, changes }: BulkNodeEditRequest,
): { candidates: Candidates; result: BulkNodeEditResult } {
  const issues: BulkNodeEditIssue[] = [];
  const selectedIds = new Set(nodeIds);
  if (selectedIds.size > MAX_BULK_NODE_EDIT_SELECTION) {
    issues.push({ message: `選択数 ${selectedIds.size} 件は上限 ${MAX_BULK_NODE_EDIT_SELECTION} 件を超えています` });
  } else if (selectedIds.size < 2) {
    issues.push({ message: '対象を 2 件以上選択してください' });
  }

  const selectedNodes = new Map<string, TaskFlowNode>();
  for (const node of nodes) {
    if (!selectedIds.has(node.id)) continue;
    if (selectedNodes.has(node.id)) {
      issues.push({ nodeId: node.id, message: '同じ ID のノードが複数存在します' });
    }
    selectedNodes.set(node.id, node);
  }
  for (const id of selectedIds) {
    if (!selectedNodes.has(id)) issues.push({ nodeId: id, message: '対象ノードが見つかりません' });
  }

  const trackers = new Map(bootstrap.trackers.map((tracker) => [tracker.id, tracker]));
  const effectiveTrackers = new Map([...selectedNodes].map(([id, node]) => [
    id, trackers.get(changes.trackerId ?? Number(node.data.trackerId)),
  ]));
  const candidates: Candidates = {
    trackerId: bootstrap.trackers,
    priorityId: bootstrap.priorities,
    assignedToId: restrictField('assignedToId', 'assigned_to_id', effectiveTrackers, bootstrap.assignable_users, changes, issues),
    fixedVersionId: restrictField('fixedVersionId', 'fixed_version_id', effectiveTrackers, bootstrap.versions, changes, issues),
  };
  const reject = (message: string) => ({ candidates, result: { ok: false as const, issues: [{ message }] } });

  const specifiedFields = fields.filter((field) => changes[field] !== undefined);
  for (const field of specifiedFields) {
    const value = changes[field];
    const options = candidates[field];
    if (!options) continue;
    if (value === null && (field === 'assignedToId' || field === 'fixedVersionId')) continue;
    if (!options.some(({ id }) => id === value)) {
      issues.push({ field, message: `指定した${attributes[field]}を選択できません` });
    }
  }

  const newTracker = changes.trackerId === undefined ? undefined : trackers.get(changes.trackerId);
  if (newTracker) {
    for (const [nodeId, node] of selectedNodes) {
      if (Number(node.data.trackerId) === newTracker.id) continue;
      if (!newTracker.allowed_status_ids.includes(Number(node.data.statusId))) {
        issues.push({ field: 'trackerId', nodeId, message: '変更先で現在のステータスを維持できません' });
      }
    }
  }
  if (issues.length) return { candidates, result: { ok: false, issues } };
  if (!specifiedFields.length) return reject('変更する属性を指定してください');

  const changedNodeIds: string[] = [];
  const updated = nodes.map((node) => {
    if (!selectedIds.has(node.id)) return node;
    const changed = specifiedFields.filter((field) => {
      const current = node.data[field];
      return changes[field] !== (current == null ? null : Number(current));
    });
    if (!changed.length) return node;
    changedNodeIds.push(node.id);
    const patch = Object.fromEntries(changed.map((field) => [field, changes[field]]));
    return { ...node, data: { ...node.data, ...patch } };
  });
  if (!changedNodeIds.length) return reject('変更される値がありません');
  return { candidates, result: { ok: true, nodes: updated, changedNodeIds } };
}
