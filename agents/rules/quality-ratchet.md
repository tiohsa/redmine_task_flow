---
title: 型・lint の原因を修正する
impact: HIGH
tags: [quality, lint, ratchet]
---

型や lint の抑止は問題の発見を遅らせる。外部から来たデータは公開境界で検証し、型を絞り込んでから扱う。既存例外を修正したら `verification/architecture-baseline.json` から対応する行を削除する。規模やスパイだけの検証で例外になっているテストを変更するときは、そのケースをルールに適合させる。例外一覧の候補と検証手順は [テスト・検証仕様](../../docs/06-testing-and-verification.md) を参照する。

**Incorrect:**

```ts
// @ts-ignore: JSON のフィールド形式は入力元が保証する
const trimmed = value.trim();
```

**Correct:**

```ts
const trimmed = typeof value === 'string' ? value.trim() : '';
```
