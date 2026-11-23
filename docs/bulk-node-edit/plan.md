# 実装計画 — ノードのチケット属性を一括変更

**Git ブランチ** `main`　**Spec Kit の機能 ID** `bulk-node-edit`　**日付** 2026-11-23

**入力仕様** [SPEC.md](SPEC.md)

## 概要

ツールバーから対象を指定し、タスクノードと親グループ枠のトラッカー、優先度、担当者、対象バージョンを一括変更する。公開入口で全件の適用可否を判定し、ストアで下書き保存と 1 回分の履歴を確定する。編集結果は既存の起票処理に渡す。

## 技術コンテキスト

| 項目 | 内容 |
| --- | --- |
| 言語・依存 | TypeScript 7（strict）、React 19、Zustand 5、既存の React Flow 12、Tailwind CSS 4、Vite 8 |
| 対象 | Redmine 6.0 / 6.1 / 7.0 のプラグイン画面。認証済み E2E は Docker の Redmine 7.0.2 / MariaDB |
| 保存 | プロジェクトと利用者で分離した既存 v1 自動下書きとメモリ上の Undo/Redo。起票結果は既存の Redmine DB に保存 |
| テスト | 公開入口を通す Vitest、既存起票ルートの Minitest、検証 CLI と認証済み実ブラウザー |
| 件数・性能 | 選択 2〜100 件。フロー全体の起票件数上限は既存契約。全件確認後、履歴とストアの確定を各 1 回、自動下書きへ書き込み 1 回 |
| 制約 | タスクと親グループはそれぞれ 1 件。選択・指定状態は画面内。現行の Bootstrap、起票 API、下書き・保存済みフロー・JSON 形式を使用 |

## 憲章チェック

| 原則 | 計画開始時のゲート | Phase 1 後の判定 |
| --- | --- | --- |
| I. 機能の公開入口 | UI とストアから公開入口へ依存 | 適合。公開関数と純粋ドメインを分離し、Rails は既存ルートを利用 |
| II. 認証・認可 | セッション、CSRF、3 権限、属性制御を維持 | 適合。403 の表示対応は既存クライアントで行い、Rails の認可を維持 |
| III. 公開契約の回帰 | 仕様のテスト ID と公開入口の結果が対応 | 適合。BNE-01〜11 を UI・公開関数・ストア操作・Rails ルートで検証 |
| IV. 統合・実ブラウザー | verify-cli と認証済み E2E を手順化 | 適合。[検証手順](quickstart.md)にコマンドと期待結果を記載 |
| V. 仕様の正本 | docs 配下の仕様を参照 | 適合。実装時に画面・検証仕様と機能マップを同期 |

境界・テスト品質の新規例外は不要。既存例外を解消した場合は対応するベースライン項目を同じ変更で削除する。

## プロジェクト構成

```text
docs/bulk-node-edit/
├── SPEC.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── editor.md
│   └── bulk-create.md
└── quickstart.md

frontend/src/
├── features/bulk-node-edit/
│   ├── index.ts                     # UI・ストアの公開入口
│   └── internal/domain/bulkEdit.ts  # 候補・適用可否・変更案を計算
├── components/
│   ├── ActionBars.tsx               # 開始ボタン
│   ├── BulkNodeEditDialog.tsx       # 選択・値指定・理由の表示
│   └── FlowCanvas.tsx               # モーダル中のショートカット制御
├── App.tsx                          # 開閉状態と全画面操作の連携
├── store/useFlowStore.ts             # 適用、履歴、既存保存境界の利用
├── api/client.ts                    # 一括登録の 403 表示
└── index.css                        # .task-flow-root 配下のダイアログ
```

## Phase 0 — 調査

[research.md](research.md) に候補の権限情報、単一ノード更新との接点、既存保存結果の扱い、キーボード操作、本文なし 403 の調査結果を記録した。仕様の `[ASSUMPTION]` 付き受け入れ条件を今回の設計入力に含める。設計を止める未決事項はない。

## Phase 1 — 設計・契約

1. `ActionBars` から `App` 管理のダイアログを起動する。ダイアログのローカル状態で対象と指定値を管理し、`index.ts` を介して候補と判定結果を表示する。
2. `useFlowStore.applyBulkNodeEdit` は同期操作として最新のノードと編集状態を読み、`index.ts` で同じ判定を再実行する。変更対象だけのノード更新案を保存し、成功時に履歴と一緒に確定する。完了後は既存の Undo/Redo と復元経路を使う。
3. 起票の前段は既存 `validateNodeAttributes`、送信は既存 `postBulkCreate` を使う。権限取り消しによる 403 は下書きを保持したまま表示する。Rails 側の公開入口は既存ルートを利用するため、新規の Rails 機能モジュールや DB 変更は発生しない。
   関連を保存する際は `app/services/task_flow/bulk_creator.rb` で保存済みチケット ID から端点を参照し、Redmine がチケット保存後の最新の親子関係を検証できるようにする。
4. 実装と同時に [キャンバス仕様](../02-canvas-and-nodes.md)、[検証仕様](../06-testing-and-verification.md)、[機能マップ](../../verification/feature-map.json) を同期する。公開契約の追加分は Vitest と Minitest に BNE ID を付ける。

[データモデル](data-model.md) · [編集契約](contracts/editor.md) · [一括登録契約](contracts/bulk-create.md) · [検証手順](quickstart.md)
