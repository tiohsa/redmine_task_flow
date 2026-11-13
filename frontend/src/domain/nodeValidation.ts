import type { BootstrapData, TaskFlowNode } from '../types/flow';

/**
 * Validates a single node's attributes against Redmine bootstrap metadata.
 * Returns an array of human-readable error messages (empty if valid).
 */
export function validateNodeAttributes(
  node: TaskFlowNode,
  bootstrap: BootstrapData | null,
): string[] {
  const errors: string[] = [];

  if (!node.data.subject || !node.data.subject.trim()) {
    errors.push('題名を入力してください');
  }

  if (
    node.type === 'taskNode' &&
    node.data.startDate &&
    node.data.dueDate &&
    node.data.startDate > node.data.dueDate
  ) {
    errors.push('開始日は期日以前の日付を指定してください');
  }

  if (bootstrap) {
    const tracker = bootstrap.trackers.find(
      (t) => t.id === Number(node.data.trackerId),
    );
    if (!tracker) {
      errors.push('有効なトラッカーを選択してください');
    } else {
      for (const cf of tracker.custom_fields) {
        if (!cf.is_required) continue;
        const raw = node.data.customFieldValues?.[String(cf.id)];
        const val = raw === undefined || raw === null ? '' : String(raw).trim();
        if (!val) {
          errors.push(`カスタムフィールド「${cf.name}」は必須です`);
        }
      }
    }
  }

  return errors;
}
