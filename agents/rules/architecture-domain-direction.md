---
title: ドメインへ入力値を渡す
impact: HIGH
tags: [architecture, domain, typescript, ruby]
---

UI やサービスでフレームワークの値をドメインの入力へ変換する。ドメインを純粋に保つと、同じ入力を渡して Rails やブラウザーから独立に検証できる。

**Incorrect:**

```ts
// features/flow-preview/internal/domain/range.ts
import { useFlowStore } from '../../../../store/useFlowStore';
export const count = () => useFlowStore.getState().nodes.length;
```

```ruby
# features/flow_preview/internal/domain/count.rb
Issue.where(project_id: project_id).count
```

**Correct:**

```ts
export const count = (nodeIds: readonly string[]): number => nodeIds.length;
```

```ruby
def count(issue_ids)
  issue_ids.length
end
```
