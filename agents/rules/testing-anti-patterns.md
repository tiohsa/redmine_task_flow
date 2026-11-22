---
title: 公開契約を具体的な結果で検証する
impact: CRITICAL
tags: [testing, quality, vitest, minitest]
---

# テスト品質

テストは仕様で定めた振る舞いを検証する。失敗したケースから、破れた契約と入力条件を追跡できるようにする。

## 公開入口を使う

Vitest は機能の `index.ts`、Minitest は `Public` サービスまたはルートを使う。検証値には仕様に基づく具体値を使う。

**Incorrect**

```ts
import { count } from '../src/features/flow-preview/internal/domain/count';
expect(count(nodeIds)).toBe(nodeIds.length);
```

**Correct**

```ts
import { preview } from '../src/features/flow-preview';
expect(preview(['a', 'b'])).toEqual({ nodeCount: 2 });
```

## 外部 I/O を差し替える

製品コードのモジュールモックは通信・永続化・時刻などの I/O 境界に置く。呼び出しを確認する場合は、利用者が観測できる結果も検証する。

**Incorrect**

```ts
vi.mock('../src/features/flow-preview');
expect(preview).toHaveBeenCalledWith(['a']);
```

**Correct**

```ts
vi.spyOn(client, 'fetchBootstrap').mockResolvedValue(bootstrap);
const data = await client.fetchBootstrap('/bootstrap');
store.getState().initialize(data, '/bulk_create');
expect(store.getState().bootstrap?.project.identifier).toBe('demo');
```

## 値・状態・エラーを明示する

レスポンスの値、永続化後の状態、例外型やメッセージを確認する。

**Incorrect**

```ruby
assert_not_nil result
assert_raises { create_flow.call }
```

**Correct**

```ruby
assert_equal({ node_count: 2 }, result)
assert_raises(ArgumentError) { create_flow.call }
```

## 仕様とテストケースを対応させる

新規機能の `docs/<feature>/SPEC.md` に正常系と、その機能に該当する境界値・失敗系の受け入れ条件をテスト ID 付きで記載する。Vitest のテスト名か Rails の `test '...'` の先頭に同じ ID を付ける。静的チェックで ID の対応を確認し、レビューで入力と期待値を照合する。

**Incorrect**

```text
プレビューに件数を表示する。テストで確認する。
```

**Correct**

```text
- 正常系 `PREVIEW-01` ノード 2 件で nodeCount は 2。
- 境界値 `PREVIEW-02` ノードなしで nodeCount は 0。
```

## ケースを小さく保つ

1 ケースを 5 検証・40 行以内に収める。繰り返す準備はヘルパーにまとめ、独立して判断できる契約ごとにケースを作る。

**Incorrect**

```ts
it('counts nodes, restores the draft, rejects invalid edges and shows errors', async () => { /* ... */ });
```

**Correct**

```ts
it('PREVIEW-02 returns zero for an empty flow', () => {
  expect(preview([])).toEqual({ nodeCount: 0 });
});
```

[新規機能の実装・テスト例](../../verification/_reference-example/README.md) · [静的チェックの対象](../../docs/06-testing-and-verification.md#15-境界チェックと-ratchet-mode)
