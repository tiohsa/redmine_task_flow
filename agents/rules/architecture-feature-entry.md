---
title: 機能の公開入口を経由する
impact: HIGH
tags: [architecture, typescript, ruby]
---

別の機能や UI からは機能の公開契約を呼び出す。新規機能の実装は `internal/` に置き、画面や Redmine のエントリーポイントから内部の変更が波及する範囲を抑える。

**Incorrect:**

```ts
import { preview } from './features/flow-preview/internal/buildPreview';
```

```ruby
TaskFlow::Features::FlowPreview::Internal::BuildPreview.new.call(nodes)
```

**Correct:**

```ts
import { preview } from './features/flow-preview/index';
```

```ruby
TaskFlow::Features::FlowPreview::Public.new.call(nodes)
```
