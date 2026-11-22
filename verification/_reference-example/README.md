# 新規機能の実装例

以下はフロープレビューのサンプル。追加する機能名に合わせてファイルを作成する。

| 役割 | React | Rails |
| --- | --- | --- |
| 公開入口 | `frontend/src/features/flow-preview/index.ts` | `app/services/task_flow/features/flow_preview/public.rb` |
| ドメイン | `frontend/src/features/flow-preview/internal/domain/count.ts` | `app/services/task_flow/features/flow_preview/internal/domain/count.rb` |
| 呼び出し元 | `frontend/src/components/` または `frontend/src/store/` | `app/controllers/task_flows_controller.rb` |

```ts
// internal/domain/count.ts
export const count = (nodeIds: readonly string[]): number => nodeIds.length;

// index.ts
import { count } from './internal/domain/count';

export function preview(nodeIds: readonly string[]) {
  return { nodeCount: count(nodeIds) };
}
```

```ruby
# internal/domain/count.rb
module TaskFlow
  module Features
    module FlowPreview
      module Internal
        module Domain
          class Count
            def self.call(node_ids)
              node_ids.length
            end
          end
        end
      end
    end
  end
end

# public.rb
module TaskFlow
  module Features
    module FlowPreview
      class Public
        def call(node_ids)
          { node_count: Internal::Domain::Count.call(node_ids) }
        end
      end
    end
  end
end
```

依存は UI／コントローラー → 機能の公開入口 → ドメインの順に向ける。Rails は自動読み込みの規約に合わせ、ディレクトリ名と定数名を対応させる。既存の API クライアントや Redmine モデルに接続する場合は公開入口からアダプターを呼び出し、ドメインにはデータを渡す。

## 公開契約とテスト

```markdown
<!-- docs/flow-preview/SPEC.md -->
- 正常系 `PREVIEW-01` ノード ID が 2 件のとき、プレビューは件数 2 を返す。
- 境界値 `PREVIEW-02` 空のフローでもプレビューを開け、件数 0 を返す。
```

```ts
// frontend/tests/flowPreview.test.ts
import { preview } from '../src/features/flow-preview';

it('PREVIEW-01 counts the supplied nodes', () => {
  expect(preview(['a', 'b'])).toEqual({ nodeCount: 2 });
});

it('PREVIEW-02 returns zero for an empty flow', () => {
  expect(preview([])).toEqual({ nodeCount: 0 });
});
```

```ruby
# test/unit/task_flow/flow_preview_test.rb
require_relative '../../test_helper'

class TaskFlowPreviewTest < ActiveSupport::TestCase
  test 'PREVIEW-01 counts the supplied nodes' do
    assert_equal({ node_count: 2 }, TaskFlow::Features::FlowPreview::Public.new.call(%w[a b]))
  end

  test 'PREVIEW-02 returns zero for an empty flow' do
    assert_equal({ node_count: 0 }, TaskFlow::Features::FlowPreview::Public.new.call([]))
  end
end
```
