# Redmine Task Flow — Agent Guide

日本語で回答する。このガイドは `plugins/redmine_task_flow/` 配下に適用する。

## プロジェクト概要・構成

Redmine 6.0 / 6.1 / 7.0 向けのビジュアル DAG タスクフローエディタ＆チケット一括起票プラグイン（プラグイン ID: `redmine_task_flow`）。

- `init.rb`: プラグイン登録、`task_flow` プロジェクトモジュール、`:create_issues_via_flow` 権限、プロジェクトメニュー定義（`:create_issues_via_flow`, `:add_issues`, `:manage_issue_relations` の 3 権限すべてで表示制御）。
- `config/routes.rb`: `/projects/:project_id/task_flow`（`index`, `bootstrap`, `bulk_create`）のルーティング定義。
- `config/locales/`: `en.yml` / `ja.yml`（ラベル・権限・`task_flow.errors.*`）。
- `app/controllers/task_flows_controller.rb`: 画面表示および JSON API（`api_request? = false` により Rails セッション認証 + CSRF 保護を使用）。
- `app/services/task_flow/`:
  - `bootstrap_presenter.rb`: プロジェクト・トラッカー・許可ステータス・可視カスタムフィールド・担当者・バージョン情報を整形。
  - `bulk_creator.rb`: 事前検証（上限・構造・循環依存）と `Issue.transaction` 内でのトポロジカル順一括起票・ロールバック。
- `app/views/task_flows/index.html.erb`: React マウントポイント（`#redmine-task-flow-root.task-flow-root`）へ `data-*` 属性で設定を渡す（API キーは出力しない）。
- `frontend/`: React 18 + TypeScript + `@xyflow/react` + Zustand + `dagre` + Tailwind CSS（`.task-flow-root` スコープ、Preflight 無効）+ Vite / Vitest。
- `assets/javascripts/task_flow.js`, `assets/stylesheets/task_flow.css`: `frontend/` のビルド生成物（IIFE 単一バンドル）。直接編集せず `frontend/src/` を編集して再ビルドする。
- `test/`: Redmine 本体のテストヘルパーを使う Minitest（`unit/` と `integration/`）。
- `docs/`: **機能ごとの仕様・設計・テスト仕様の正本（Source of Truth）**。機能ごとに仕様書を整理し、古い記述や不要なファイルを残さず常に実装と一致した最新状態に保つ。

## 開発環境・ビルド・テストコマンド

このチェックアウトでは親の `../../docker-compose.yml`（Redmine 7.0.2 / MariaDB 11.4、接続先 `http://localhost:3000`）を使用する。プラグイン固有の gem や DB マイグレーションは不要。

### Docker 環境（プラグインルートから実行）

```bash
docker compose -f ../../docker-compose.yml up -d
docker compose -f ../../docker-compose.yml restart redmine
```

- Ruby ファイル・ルート・ビュー・`assets/` の変更を反映するには `redmine` コンテナを再起動する。

### フロントエンド（`frontend/` 配下で実行）

```bash
npm run build        # tsc -b && vite build（../assets/ へ IIFE バンドル出力）
npm run build:watch  # 監視ビルド
npm test             # Vitest 実行
```

### バックエンド（Minitest）

- コンテナ内実行（プラグインルートから）:

```bash
docker compose -f ../../docker-compose.yml exec -e RAILS_ENV=test redmine bundle exec rails test plugins/redmine_task_flow/test
```

- 単一ファイル実行例:

```bash
docker compose -f ../../docker-compose.yml exec -e RAILS_ENV=test redmine bundle exec rails test plugins/redmine_task_flow/test/unit/task_flow/bulk_creator_test.rb
```

- Docker を使わない場合（Redmine 本体のルートから）:

```bash
RAILS_ENV=test bundle exec rails test plugins/redmine_task_flow/test
```

- **前提**: `../../docker-compose.yml` の既定値は `RAILS_ENV=production` であり、コンテナ内の `config/database.yml` には `test:` DB 設定が含まれていない。`RAILS_ENV=test` を実行する前に Redmine 本体の `config/database.yml` へ専用の `test` DB を設定・準備する。

## テスト・検証要件

- 変更内容に応じてバックエンド（Minitest）およびフロントエンド（Vitest）の回帰テストを追加・実行する。
- **実ブラウザでのテストを必須とする**: 単体テスト・結合テストに加え、UI や API 挙動を変更した場合は Docker 上の Redmine（`http://localhost:3000`）に実ブラウザでアクセスし、画面初期表示、ノード/エッジ操作・D&D、一括起票とエラー表示、再読み込み後の保存結果・下書き復元、権限不足時の挙動を確認する。
- 実行したコマンドと結果を報告し、環境制約により実行できなかった検証は明記する。

## コード規約・セキュリティ

- **Ruby**: 2 スペースインデント、`snake_case` ファイル名、`CamelCase` クラス名。補間不要な文字列は原則シングルクォート。追加クラスは `TaskFlow` 名前空間に置く。
- **TypeScript / CSS**: `tsconfig.json` の `strict: true` を維持する。Tailwind CSS は `.task-flow-root` スコープを維持し、Redmine 本体の CSS と衝突させない。
- **認証・セキュリティ**: `TaskFlowsController` のセッション認証・3 権限検証・CSRF 保護（`X-CSRF-Token`）を維持する。ユーザー API キーをページ・ログ・テスト・コミットに含めない。チケット作成時は `Issue#safe_attributes=` を経由し、Redmine 標準の権限制御・無効化フィールド制御を維持する。
- **生成物**: `assets/javascripts/task_flow.js` と `assets/stylesheets/task_flow.css` は `frontend/` から生成されるため直接編集しない。

## コミット・ドキュメント運用

- Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` 等）を使用する。
- 機能追加・仕様変更時は `docs/` 配下の該当仕様書（正本）およびテストを同時に更新し、仕様書を常に最新に保つ（不要・陳腐化した記述は削除する）。
