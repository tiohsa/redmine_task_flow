# Redmine Task Flow 仕様書正本

本ディレクトリ（`docs/`）は、`redmine_task_flow` プラグインの機能仕様・設計仕様・テスト仕様の**正本（Single Source of Truth）**です。
機能追加や仕様変更を行う際は、実装コードと併せて該当する仕様書を更新してください。

## 1. プラグイン概要と全体構成

- **プラグイン ID**: `:redmine_task_flow`（`init.rb`）
- **対応 Redmine**: `requires_redmine version_or_higher: '6.0.0'`
- **役割**: プロジェクト単位で起動するビジュアル DAG タスクフローエディタおよびチケット一括起票機能を提供する。

### システム構成

| 層 | 主な技術・モジュール | 役割 |
|---|---|---|
| バックエンド | Ruby / Rails (`TaskFlowsController`, `TaskFlow::BootstrapPresenter`, `TaskFlow::BulkCreator`) | 権限チェック、初期化メタデータ JSON 配信、トランザクション一括登録（チケット・親子関係・`precedes` 関連） |
| ビュー / アセット連携 | ERB (`app/views/task_flows/index.html.erb`) | `#redmine-task-flow-root.task-flow-root` 要素に API URL を埋め込み、ビルド済み JS/CSS を読み込む |
| フロントエンド | React 18, TypeScript, `@xyflow/react` v12, Zustand v5, `dagre`, Tailwind CSS v3, Vite v5 | DAG キャンバス編集、循環依存チェック、日付自動伝播、自動レイアウト、インスペクタ編集、下書き保存、一括登録 UI |
| ビルド成果物 | `assets/javascripts/task_flow.js`, `assets/stylesheets/task_flow.css` | `frontend/vite.config.ts` により IIFE 形式 (`RedmineTaskFlow`) で `assets/` へ直接出力 |

## 2. 仕様書一覧

| ドキュメント | 対象領域 | 主な内容 |
|---|---|---|
| [01-auth-and-bootstrap.md](01-auth-and-bootstrap.md) | 認証・権限・初期化 | プラグイン登録、プロジェクトモジュール、権限・メニュー表示条件、ルーティング、Bootstrap API、フロントエンド初期起動 |
| [02-canvas-and-nodes.md](02-canvas-and-nodes.md) | キャンバス・ノード操作 | React Flow キャンバス設定、ツールバー（保存・読込モーダル起動含む）、ショートカット、Undo/Redo、送信後ロック/リセット、タスク/グループノード、親子付け替え |
| [03-dependencies-and-scheduling.md](03-dependencies-and-scheduling.md) | 依存関係・日程・レイアウト | `precedes` エッジ、循環依存検出 (DAG)、カレンダー日プレビュー伝播 (`delay`, `lockDates`, `baseDate`, 工数換算、ロールアップ)、`dagre` 自動整列 |
| [04-inspector-and-validation.md](04-inspector-and-validation.md) | インスペクタ・検証 | 折りたたみ・フォーカス制御、トラッカー別コアフィールド無効化、カスタムフィールド描画、クライアント側送信前バリデーション |
| [05-persistence-and-bulk-create.md](05-persistence-and-bulk-create.md) | 永続化・一括登録 | `localStorage` 下書き自動保存・名前付きフロー保存（最大 5 件）、JSON エクスポート/インポート（ID フォールバック）、`bulk_create` API、結果モーダル、I18n |
| [06-testing-and-verification.md](06-testing-and-verification.md) | テスト・検証 | Backend Minitest、Frontend Vitest、Docker 開発/テスト環境手順、実ブラウザ E2E 検証シナリオ |
| [ノード属性の一括変更](bulk-node-edit/SPEC.md) | レビュー用ドラフト | 対象選択、項目指定、トラッカー連動、適用・取消、履歴と検証 |

## 3. 実装ファイル対応表

### バックエンド・設定

- `init.rb` — プラグイン登録・モジュール・権限・メニュー定義 → `01-auth-and-bootstrap.md`
- `config/routes.rb` — `projects/:project_id/task_flow` ルーティング → `01-auth-and-bootstrap.md`
- `app/controllers/task_flows_controller.rb` — `index`, `bootstrap`, `bulk_create` アクション → `01-auth-and-bootstrap.md`, `05-persistence-and-bulk-create.md`
- `app/services/task_flow/bootstrap_presenter.rb` — Bootstrap JSON 生成 → `01-auth-and-bootstrap.md`
- `app/services/task_flow/bulk_creator.rb` — トポロジカル順チケット作成・関連作成・ロールバック → `05-persistence-and-bulk-create.md`
- `app/views/task_flows/index.html.erb` — マウント用ルート要素 → `01-auth-and-bootstrap.md`
- `config/locales/ja.yml`, `config/locales/en.yml` — ラベル・I18n エラーメッセージ → `01-auth-and-bootstrap.md`, `05-persistence-and-bulk-create.md`

### フロントエンド (`frontend/src/`)

- `main.tsx`, `App.tsx` — マウント・Bootstrap 読込・画面レイアウト → `01-auth-and-bootstrap.md`
- `types/flow.ts` — 型定義 (`BootstrapData`, `TaskFlowNode`, `TaskFlowEdge`, `BulkCreateRequestPayload` 等) → 全仕様書
- `store/useFlowStore.ts` — Zustand ストア（状態・履歴・グラフ操作・送信制御） → `02`, `03`, `04`, `05`
- `components/FlowCanvas.tsx`, `components/ActionBars.tsx` — キャンバス・ツールバー・ズーム・ショートカット → `02-canvas-and-nodes.md`
- `components/nodes/TaskNode.tsx`, `components/nodes/GroupNode.tsx` — ノード UI → `02-canvas-and-nodes.md`
- `components/edges/DependencyEdge.tsx` — 依存エッジ UI → `03-dependencies-and-scheduling.md`
- `domain/graphValidation.ts` — 接続・循環依存検証 → `03-dependencies-and-scheduling.md`
- `domain/datePropagation.ts` — 日付伝播・グループロールアップ → `03-dependencies-and-scheduling.md`
- `domain/autoLayout.ts` — `dagre` 自動レイアウト → `03-dependencies-and-scheduling.md`
- `components/InspectorPanel.tsx` — 右側属性編集パネル → `04-inspector-and-validation.md`
- `domain/nodeValidation.ts` — 単一ノード属性バリデーション → `04-inspector-and-validation.md`
- `domain/persistence.ts` — `localStorage` 下書き・名前付きフロー保存（最大 5 件）・JSON 入出力・サニタイズ → `05-persistence-and-bulk-create.md`
- `api/client.ts`, `components/ResultModal.tsx`, `components/SavedFlowsModal.tsx` — API 通信・結果モーダル・保存/読込モーダル・トースト → `01`, `02`, `05`
- `domain/uuid.ts` — ノード/エッジ/トースト用 ID 生成 (`generateId`) → `02-canvas-and-nodes.md`
- `index.css` — `.task-flow-root` スコープ用スタイル調整 → `02-canvas-and-nodes.md`

### テスト

- `test/` (`test_helper.rb`, `unit/plugin_test.rb`, `unit/task_flow/*.rb`, `integration/task_flows_test.rb`) → `06-testing-and-verification.md`
- `frontend/tests/` (`setup.ts`, `graphValidation.test.ts`, `datePropagation.test.ts`, `storeAndLayout.test.ts`, `persistence.test.ts`, `savedFlows.test.tsx`, `client.test.ts`, `inspectorPanel.test.tsx`, `actionBars.test.tsx`, `fullscreenToggle.test.tsx`, `cursorStyles.test.ts`) → `06-testing-and-verification.md`
