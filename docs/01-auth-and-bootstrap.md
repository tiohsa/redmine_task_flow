# 01. 認証・権限・起動・Bootstrap 仕様

本ドキュメントは `redmine_task_flow` プラグインの Redmine への登録、権限・メニュー制御、ルーティング、画面マウント、および初期マスタデータ取得（Bootstrap）の仕様を定義する。

---

## 1. プラグイン登録（`init.rb`）

`init.rb` にて `Redmine::Plugin.register :redmine_task_flow` として登録する。

| 項目 | 値 |
| :--- | :--- |
| プラグイン ID | `:redmine_task_flow` |
| 表示名 (`name`) | `'Redmine Task Flow'` |
| 説明 (`description`) | `'Visual DAG task flow editor and bulk issue creator for Redmine'` |
| バージョン (`version`) | `'0.1.0'` |
| 対応 Redmine バージョン | `requires_redmine version_or_higher: '6.0.0'` |

### 1.1 プロジェクトモジュールと権限

* `project_module :task_flow` を定義する。
* 権限 `:create_issues_via_flow` を `{ task_flows: [:index, :bootstrap, :bulk_create] }, require: :member` として登録する。

### 1.2 プロジェクトメニュー

* `menu :project_menu, :task_flow` を `{ controller: 'task_flows', action: 'index' }`、`caption: :label_task_flow`、`after: :new_issue`、`param: :project_id` で登録する。
* 表示条件（`if` Proc）は以下 3 権限のすべてを満たす場合のみ `true` とする：
  1. `User.current.allowed_to?(:create_issues_via_flow, project)`
  2. `User.current.allowed_to?(:add_issues, project)`
  3. `User.current.allowed_to?(:manage_issue_relations, project)`

---

## 2. ルーティング（`config/routes.rb`）

`resources :projects` 配下に `resource :task_flow, only: []` として定義する。

| HTTP Method | パス | コントローラ / アクション | 名前付きルートヘルパー |
| :--- | :--- | :--- | :--- |
| `GET` | `/projects/:project_id/task_flow` | `task_flows#index` | `project_task_flow_path` |
| `GET` | `/projects/:project_id/task_flow/bootstrap` (`.json`) | `task_flows#bootstrap` | `bootstrap_project_task_flow_path` |
| `POST` | `/projects/:project_id/task_flow/bulk_create` (`.json`) | `task_flows#bulk_create` | `bulk_create_project_task_flow_path` |

---

## 3. コントローラ認証・認可（`app/controllers/task_flows_controller.rb`）

`TaskFlowsController < ApplicationController` は `menu_item :task_flow` を指定し、以下の `before_action` を順に実行する。

1. `find_project_by_project_id`: `:project_id`（数値 ID または `identifier`）から `@project` を取得。存在しない場合は `404 Not Found`。
2. `authorize`: Redmine 標準のモジュール有効化および `:create_issues_via_flow` 権限を検証。
3. `authorize_task_flow_permissions`: `:create_issues_via_flow`、`add_issues`、`:manage_issue_relations` の 3 権限すべてを `User.current.allowed_to?` で検証する。
   * いずれか 1 つでも不足する場合、JSON リクエスト（`request.format.json?`）は `403 Forbidden`（`{ error: l(:notice_not_authorized) }`）、HTML リクエストは `render_403`（`403`）を返す。

### 3.1 セッション認証と CSRF 保護

* `api_request?` を `false` にオーバーライドする。これにより `.json` エンドポイント（`bootstrap` / `bulk_create`）でも Redmine のステートレス API キー認証ではなく、Rails セッション認証および CSRF 保護（`X-CSRF-Token`）を強制する。

---

## 4. 画面マウントとフロントエンド起動

### 4.1 ビュー（`app/views/task_flows/index.html.erb`）

* `html_title(l(:label_task_flow))` を設定する。
* `content_for :header_tags` で `stylesheet_link_tag 'task_flow', plugin: 'redmine_task_flow'` を読み込み、末尾で `javascript_include_tag 'task_flow', plugin: 'redmine_task_flow'` を読み込む。
* マウントポイントとして `<div id="redmine-task-flow-root" class="task-flow-root" ...>` を出力し、以下の `data-*` 属性のみを受け渡す（`User.current.api_key` 等は出力しない）：
  * `data-project-id`: `@project.id`
  * `data-project-identifier`: `@project.identifier`
  * `data-bootstrap-url`: `bootstrap_project_task_flow_path(@project, format: :json)`
  * `data-bulk-create-url`: `bulk_create_project_task_flow_path(@project, format: :json)`

### 4.2 エントリポイント（`frontend/src/main.tsx` / `frontend/src/App.tsx`）

* `mountTaskFlow()` が `#redmine-task-flow-root` を検出し、`dataset.bootstrapUrl` と `dataset.bulkCreateUrl` を読み取る（欠落時は設定エラーメッセージを表示して中断）。
* `App` コンポーネントのマウント時に `fetchBootstrap(bootstrapUrl)`（`frontend/src/api/client.ts`）を実行し、取得完了まではローディング表示、失敗時はエラーメッセージ表示を行う。
* 取得成功後、`useFlowStore.getState().initialize(data, bulkCreateUrl)` を呼び出してフローを初期化する。

---

## 5. Bootstrap API（`app/services/task_flow/bootstrap_presenter.rb`）

`TaskFlowsController#bootstrap` は `TaskFlow::BootstrapPresenter.new(@project, User.current).as_json` を JSON で返却する。

### 5.1 レスポンス構造（`BootstrapData`）

| フィールド | 取得元・仕様 |
| :--- | :--- |
| `project` | `{ id: @project.id, identifier: @project.identifier, name: @project.name }` |
| `trackers` | `Issue.allowed_target_trackers(@project, @user)` を対象に各トラッカーをシリアライズ（下記参照） |
| `statuses` | `IssueStatus.sorted` の各要素 `{ id, name, is_default }`（`is_default` は `allowed_trackers.first&.default_status_id` との一致判定） |
| `priorities` | `IssuePriority.active.sorted` の各要素 `{ id, name, is_default: priority.is_default? }` |
| `assignable_users` | `@project.assignable_users` の各要素 `{ id, name }` |
| `versions` | `@project.shared_versions.open.sorted` の各要素 `{ id, name }` |
| `current_user_id` | `@user.id` |

### 5.2 トラッカーおよびカスタムフィールドのシリアライズ

各トラッカーについて仮インスタンス `Issue.new(project: @project, tracker: tracker, author: @user)` を生成し、以下を返却する：

* `id`, `name`, `default_status_id`
* `allowed_status_ids`: `issue.new_statuses_allowed_to(@user, true).map(&:id)`
* `disabled_core_fields`: `tracker.disabled_core_fields`
* `custom_fields`: `issue.available_custom_fields.select { |cf| cf.visible_by?(@project, @user) }` を対象とし、各項目 `{ id, name, field_format, is_required }` を返却。`cf.field_format == 'list'` の場合のみ `possible_values: Array(cf.possible_values).map(&:to_s)` を付与する。

---

## 6. クライアント初期フロー構築（`frontend/src/store/useFlowStore.ts`）

`initialize(bootstrap, bulkCreateUrl)` は以下の順で初期状態を構築する：

1. `loadDraftFromStorage(bootstrap.project.id, bootstrap.current_user_id)` で `localStorage` の下書きを取得する。
2. 下書きが存在し、`parseAndSanitizeFlowJson(rawDraft, bootstrap)` が `ok: true` かつ `nodes.length > 0` の場合：
   * `effectiveBaseDate = imported.data.baseDate || todayYmd()` とする。
   * `normalizeNodesOrder` および `propagateDates` を適用してノードを復元し、`isSubmitted: false` でストアへ格納する。
   * `imported.warnings` があれば警告トースト（`'warning'`）を表示し、さらに `'前回の下書きを復元しました'`（`'info'`）を表示する。
3. 有効な下書きがない場合：
   * `createSampleFlow(bootstrap, todayYmd())` により初期サンプルフロー（親グループ 1 件＋タスク 4 件＋エッジ 4 本）を生成し、`normalizeNodesOrder` を適用して初期化する。
