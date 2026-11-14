# 05. 永続化・JSON入出力・一括登録（Bulk Create）仕様

本ドキュメントは `localStorage` による下書き自動保存、名前付きフロー保存（最大 5 件）、JSON エクスポート／インポート、クライアント API 通信、バックエンド一括起票（`bulk_create`）、結果モーダル、および I18n エラー仕様を定義する。

---

## 1. `localStorage` 下書き自動保存（`frontend/src/domain/persistence.ts`, `frontend/src/store/useFlowStore.ts`）

* **ストレージキー**: `getDraftStorageKey(projectId, userId)` により `task_flow_draft_v1_${projectId}_${userId}` を使用する。
* **保存データ形式（`SerializedFlowData`）**:
  * `{ schema_version: 1, baseDate: string, nodes: TaskFlowNode[], edges: TaskFlowEdge[] }`
* **保存タイミング**: `persistDraftIfReady(state)` により、ノード／エッジ追加・削除・移動・属性変更・基準日変更・レイアウト・Undo/Redo・JSONインポート・保存データ読込等の状態変更時に自動保存する。ただし `!state.bootstrap` または `state.isSubmitted === true` の場合は保存しない。
* **例外保護**: `saveDraftToStorage` / `loadDraftFromStorage` / `clearDraftFromStorage` は `try/catch` で保護し、`QuotaExceededError` 等が発生してもアプリをクラッシュさせない。
* **クリアタイミング**: `bulk_create` 成功時、`resetFlow()` 実行時、`resetToSample()` 実行時に `clearDraftFromStorage` を呼び出す。

---

## 2. `localStorage` 名前付きフロー保存・読込（最大 5 件）（`persistence.ts`, `useFlowStore.ts`, `SavedFlowsModal.tsx`）

* **ストレージキー**: `getSavedFlowsStorageKey(projectId, userId)` により `task_flow_saved_v1_${projectId}_${userId}` を使用する（自動下書きとは別枠でプロジェクト × ユーザー単位に保持）。
* **保存上限**: `MAX_SAVED_FLOWS = 5`。5 件到達状態での新規保存はエラーメッセージを表示してブロックする（既存データの上書きまたは削除で再保存可能）。
* **保存名バリデーション（`validateSavedFlowName`）**: 前後空白をトリムし、空文字／空白のみを拒否、最大長は `MAX_SAVED_FLOW_NAME_LENGTH = 50` 文字。同名保存は `id` により一意識別して許可する。
* **保存データ形式（`SavedFlowEntry[]`）**:
  * `{ id: string, name: string, updatedAt: string (ISO8601), data: SerializedFlowData }`
  * `buildNormalizedFlowPayload` により、各ノードの `selected: false`、`data.createdIssueId: null`、各エッジの `selected: false` に正規化して保存する。
* **操作仕様**:
  * **新規保存（`saveCurrentFlowAsNew`）**: 名前検証と上限（5 件）確認後、現在のフローを保存配列末尾に追加して永続化する（`isSubmitted: true` 時も操作可）。
  * **上書き保存（`overwriteSavedFlow`）**: 対象項目の `data` と `updatedAt` を現在のフローで差し替える（件数は増やさない）。
  * **読込（`loadSavedFlow`）**: `parseAndSanitizeFlowJson` によるサニタイズ（別プロジェクト／無効 ID のフォールバック警告含む）と `pushSnapshot()` による Undo 履歴積み上げを行い、`propagateDates` を再計算して `isSubmitted: false` として復元・自動下書きへ同期し、モーダルを閉じる。
  * **削除（`deleteSavedFlow`）**: 対象項目を一覧および `localStorage` から削除する。
* **例外・破損保護**: `loadSavedFlowsFromStorage` / `saveSavedFlowsToStorage` は `try/catch` で保護し、破損 JSON や不正スキーマ要素を除外して最大 5 件まで読み込む。

---

## 3. JSON エクスポート／インポート（`frontend/src/domain/persistence.ts`, `frontend/src/components/ResultModal.tsx`）

### 3.1 エクスポート（`serializeFlowJson`）

* `buildNormalizedFlowPayload` を用いて `schema_version: 1`、`baseDate`、`nodes`、`edges` を整形済み JSON（インデント 2 スペース）として出力する。
* 出力時は各ノードの `selected: false`、`data.createdIssueId: null`、各エッジの `selected: false` に正規化する。
* `ResultModal` の JSON エクスポートダイアログから「JSONをコピー」（`navigator.clipboard.writeText`）または「ダウンロード」（ファイル名 `task_flow.json`）を実行できる。

### 3.2 インポート（`parseAndSanitizeFlowJson`）

* JSON パース失敗時は `'JSON の形式が正しくありません'`、`schema_version !== 1` または `nodes` / `edges` が配列でない場合は `'タスクフロー形式（schema_version: 1, nodes, edges）ではありません'` を返す。
* `bootstrap` が渡されている場合、対象プロジェクトに存在しない ID を以下の通りフォールバック／除外し、`warnings` 配列へ重複なく記録する：
  * `trackerId`: 先頭トラッカー `bootstrap.trackers[0]` へフォールバック。
  * `statusId`: 対象トラッカーの `allowed_status_ids` に含まれない場合、`tracker.default_status_id ?? defaultStatus?.id` へフォールバック。
  * `priorityId`: `bootstrap.priorities` に存在しない場合、`is_default`（または先頭）へフォールバック。
  * `assignedToId`: `bootstrap.assignable_users` に存在しない場合、`null` へリセット。
  * `fixedVersionId`: `bootstrap.versions` に存在しない場合、`null` へリセット。
  * `customFieldValues`: 対象トラッカーの `custom_fields` に存在しないキーを除外。
* `groupNode` は `parentId: undefined` とし、全ノードを `groupNode` → `taskNode` の順に並べ替える。
* エッジは存在する `source` / `target` のみを残し、`type: 'dependencyEdge'`、`delay` は `0〜60` の範囲にクランプする。
* `baseDate` が `/^\d{4}-\d{2}-\d{2}$/` に一致しない場合は空文字とし、ストア側で現行 `baseDate` を維持する。
* `useFlowStore#importJson` は `pushSnapshot()` で Undo 履歴を積んだ上で `propagateDates` を再計算し、`isSubmitted: false` として復元・下書き保存する。

---

## 4. クライアント API 通信（`frontend/src/api/client.ts`）

* `requestJson` はすべてのリクエストに `Accept: application/json`、`X-Requested-With: XMLHttpRequest`、`credentials: 'same-origin'` を付与する。
* `GET` / `HEAD` 以外では `meta[name="csrf-token"]` から取得した `X-CSRF-Token` と `Content-Type: application/json` を付与する。
* `response.redirected === true` または `Content-Type` に `application/json` が含まれない場合は `SessionExpiredError` を送出する。
* `postBulkCreate` はステータス `200` / `201` で `{ ok: true, data }`、`422` で `{ ok: false, status: 422, data }` を返し、それ以外（`403` 等）は `ApiError` を送出する。

---

## 5. 一括登録（`useFlowStore#submitBulkCreate` / `TaskFlowsController#bulk_create`）

### 5.1 送信前クライアント検証とペイロード構築

1. `isSubmitting` または `isSubmitted` の場合は処理しない。`nodes.length === 0` の場合は警告トーストを出して中断する。
2. 全ノードに対し `validateNodeAttributes(node, bootstrap)` を実行する。1 件でもエラーがあれば `validationErrors` をセットし、最初のエラーノードを選択して送信を中止する。
3. 問題なければ `BulkCreateRequestPayload`（`issues` 配列と `relations` 配列）を組み立てて `POST /projects/:project_id/task_flow/bulk_create.json` へ送信する。
   * `is_group: true` のノードは `parent_temp_id: null`、`estimated_hours: null`、`start_date: null`、`due_date: null` として送信する。
   * `relations` の `relation_type` は常に `'precedes'` とする。

### 5.2 コントローラの Strong Parameters（`app/controllers/task_flows_controller.rb`）

* `permitted_issues_params`: `:temp_id`, `:parent_temp_id`, `:is_group`, `:tracker_id`, `:subject`, `:status_id`, `:priority_id`, `:assigned_to_id`, `:fixed_version_id`, `:estimated_hours`, `:start_date`, `:due_date`, `:description` を許可する。`custom_field_values` が `ActionController::Parameters` または `Hash` の場合はキーを文字列化して許可する。
* `permitted_relations_params`: `:source_temp_id`, `:target_temp_id`, `:relation_type`, `:delay` を許可する。
* `TaskFlow::BulkCreator#call` の結果に応じ、`result[:ok]` が真なら `201 Created`（`{ issues: result[:issues], relations: result[:relations] }`）、偽なら `422 Unprocessable Entity`（`{ errors: result[:errors] }`）を返す。

---

## 6. バックエンド一括起票サービス（`app/services/task_flow/bulk_creator.rb`）

`TaskFlow::BulkCreator` は定数 `MAX_ISSUES = 100`、`MAX_RELATIONS = 200`、`ISSUE_SAFE_ATTR_KEYS` を持つ。

### 6.1 トランザクション前検証（`validate_before_transaction`）

DB 操作前に以下を検証し、1 件でもエラーがあれば DB に触れず `{ ok: false, errors: [...] }` を返す：

1. `issues` が空でないこと（空の場合は即返却）。
2. `issues.size <= MAX_ISSUES (100)` および `relations.size <= MAX_RELATIONS (200)`（超過時は即返却）。
3. 各 `temp_id` が空でなく、重複していないこと。
4. `parent_temp_id` 指定時：自己参照でないこと、同一リクエスト内に親 `temp_id` が存在すること、子側が `is_group: true`（ネスト）でないこと。
5. 各 `relations` 要素：`relation_type` が `'precedes'`（省略時は `'precedes'`）であること、`source_temp_id` / `target_temp_id` がともに存在すること、自己ループでないこと、両端点が `is_group: true` でないこと、`(source_temp_id, target_temp_id)` の重複がないこと。
6. 上記に問題がない場合、通常タスク（`!truthy?(is_group)`）のみを対象に Kahn 法（`topological_sort_tasks`）を実行し、循環依存（閉路）がないこと。

### 6.2 トランザクション内の作成順序とロールバック

1. `topological_sort_issues` により、`is_group: true` の親チケットを先頭、続いてトポロジカルソート順の通常チケット（`group_issues + task_issues`）に並べる。`sort_relations` で関連もソートする。
2. `Issue.transaction` 内で各ノードを `Issue.new(project: @project, author: @user)` として生成し、`build_safe_attributes` の結果を `issue.send(:safe_attributes=, attrs, @user)` 経由で代入・保存する。
   * `is_group` が truthy（`true`, `'true'`, `1`, `'1'`）の場合、`start_date` / `due_date` / `estimated_hours` を明示的に `nil` とし、Redmine 標準の親子ロールアップと競合しないようにする。
   * `parent_temp_id` が指定されており、親の作成が成功している場合のみ `parent_issue_id` を設定する。
3. チケット保存エラーが 0 件の場合のみ `IssueRelation`（`relation_type: 'precedes'`, `delay: rel_item[:delay].nil? ? 0 : rel_item[:delay].to_i`）を作成する。
4. チケットまたは関連の保存で 1 件でもエラーがあれば `raise ActiveRecord::Rollback` で全件ロールバックする。
5. 成功時は `created_issues.each_value(&:reload)` で Redmine コアの `soonest_start`（非稼働日スキップ）および親子ロールアップ後の確定値を再取得し、元の `@issues` 入力順で `{ temp_id, id, start_date (iso8601), due_date (iso8601) }` と `relations`（`{ id, source_temp_id, target_temp_id }`）を返却する。

---

## 7. 結果モーダル・状態遷移（`frontend/src/components/ResultModal.tsx`, `useFlowStore.ts`）

* **成功時 (`201 Created`)**:
  * 各ノードに `createdIssueId`, `startDate`, `dueDate` を同期反映し、`createdIssuesMap` を更新、`isSubmitted: true`、`resultModalOpen: true`、`resultModalMode: 'success'` とする。
  * モーダルには `#id`（`/issues/:id` への `target="_blank"` リンク）、題名、確定日程（`startDate 〜 dueDate`）の一覧テーブルを表示する。
* **バリデーション失敗時 (`422 Unprocessable Entity`)**:
  * `temp_id` ありのエラーを `validationErrors[temp_id]`、`temp_id: null` のエラーを `submitErrorMessages` へ格納し、`resultModalMode: 'error'` でロールバック通知とエラー詳細を表示する。最初のエラー `temp_id` を選択状態にする。
* **通信エラー／セッション切れ**:
  * `SessionExpiredError` または通信エラーメッセージをトースト通知で表示し、`isSubmitting: false` に戻す。

---

## 8. I18n 仕様（`config/locales/en.yml`, `config/locales/ja.yml`）

`en` / `ja` 双方に以下のキーを定義する。

### 8.1 プラグイン・権限ラベル

* `label_task_flow`
* `project_module_task_flow`
* `permission_create_issues_via_flow`

### 8.2 `task_flow.errors.*` エラーメッセージ一覧（14 キー）

| キー | 発生条件（`BulkCreator`） |
| :--- | :--- |
| `empty_issues` | `issues` が空 |
| `too_many_issues` | `issues.size > 100`（`%{max}`） |
| `too_many_relations` | `relations.size > 200`（`%{max}`） |
| `blank_temp_id` | `temp_id` が空 |
| `duplicate_temp_id` | `temp_id` 重複（`%{temp_id}`） |
| `missing_parent_temp_id` | `parent_temp_id` が存在しない（`%{parent_temp_id}`） |
| `nested_group_not_allowed` | `is_group: true` かつ `parent_temp_id` 指定（グループ入れ子） |
| `self_parent_not_allowed` | `parent_temp_id == temp_id` |
| `missing_relation_endpoint` | `source_temp_id` または `target_temp_id` が存在しない（`%{temp_id}`） |
| `self_loop_not_allowed` | `source_temp_id == target_temp_id` |
| `group_relation_not_allowed` | 関連の端点が `is_group: true` |
| `duplicate_relation` | 同一 `(source, target)` ペアの重複（`%{source}`, `%{target}`） |
| `invalid_relation_type` | `relation_type` が `'precedes'` 以外（`%{relation_type}`） |
| `cycle_detected` | 依存関係に循環（閉路）が存在 |
