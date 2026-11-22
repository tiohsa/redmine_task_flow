---
title: 低レベル API をアダプターに集約する
impact: HIGH
tags: [architecture, io, redmine]
---

HTTP は既存の `frontend/src/api/client.ts` に集約し、ブラウザー I/O やタイマーの共通処理は `frontend/src/core/` に置く。Redmine のデータ操作は標準モデルの API を使い、SQL が必要な処理は `app/services/task_flow/infrastructure/` の公開アダプターに集約する。

**Incorrect:**

```ts
const response = await fetch(bootstrapUrl);
```

```ruby
ActiveRecord::Base.connection.execute('SELECT COUNT(*) FROM issues')
```

**Correct:**

```ts
import { fetchBootstrap } from '../api/client';

const bootstrap = await fetchBootstrap(bootstrapUrl);
```

```ruby
Issue.visible(user).where(project: project).count
```
