# 06. テスト・検証仕様

本ドキュメントは `redmine_task_flow` プラグインの単体テスト・結合テスト・開発環境セットアップ、および実ブラウザでの E2E 検証シナリオを定義する。

---

## 1. テスト構成と開発環境

### 1.1 Docker Compose 環境（`../../docker-compose.yml`）

プラグインルート（`plugins/redmine_task_flow`）から親ディレクトリの `../../docker-compose.yml` を使用する。

| サービス | イメージ | コンテナ名 | 備考 |
| :--- | :--- | :--- | :--- |
| `redmine` | `redmine:7.0.2` | `redmine-dev-7` | ポート `3000:3000`（接続先 `http://localhost:3000`）、既定 `RAILS_ENV=production` |
| `db` | `mariadb:11.4` | `redmine-db-7` | DB `redmine` / User `redmine` / Password `password` |

* 起動: `docker compose -f ../../docker-compose.yml up -d`
* プラグイン変更の反映: `docker compose -f ../../docker-compose.yml restart redmine`

### 1.2 Rails テスト実行前提とコマンド

* **重要前提**: Docker Compose の既定値は `RAILS_ENV=production` であり、コンテナ内の `config/database.yml` には `production:` のみが定義されている。`RAILS_ENV=test` でテストを実行するには、事前に Redmine 本体の `config/database.yml` に専用の `test:` DB を設定し、テスト用 DB のマイグレーション／準備を行う必要がある。
* **全テスト実行（プラグインルートから）**:
  ```bash
  docker compose -f ../../docker-compose.yml exec -e RAILS_ENV=test redmine bundle exec rails test plugins/redmine_task_flow/test
  ```
* **単一ファイル実行例**:
  ```bash
  docker compose -f ../../docker-compose.yml exec -e RAILS_ENV=test redmine bundle exec rails test plugins/redmine_task_flow/test/unit/plugin_test.rb
  ```
* **Docker を使わない場合（Redmine 本体ルートから）**:
  ```bash
  RAILS_ENV=test bundle exec rails test plugins/redmine_task_flow/test
  ```

### 1.3 フロントエンド ビルド・テストコマンド（`frontend/package.json`）

`frontend/` ディレクトリで実行する。

* **単体テスト（Vitest）**: `npm test`（`vitest run`）
* **型チェック＆本番バンドルビルド**: `npm run build`（`tsc -b && vite build` → `../assets/javascripts/task_flow.js` および `../assets/stylesheets/task_flow.css` へ出力）

---

## 2. バックエンドテスト仕様（Minitest: `test/`）

### 2.1 プラグイン登録テスト（`test/unit/plugin_test.rb`）

* `RedmineTaskFlowPluginTest`: `:redmine_task_flow` として登録され、名前が `'Redmine Task Flow'` であることを検証。

### 2.2 BootstrapPresenter 単体テスト（`test/unit/task_flow/bootstrap_presenter_test.rb`）

* `TaskFlowBootstrapPresenterTest`: `disabled_core_fields`、`default_status_id`、`allowed_status_ids`、必須リスト型カスタムフィールド（`possible_values` 含む）、プロジェクトおよびユーザーメタデータの返却を検証。

### 2.3 BulkCreator 単体テスト（`test/unit/task_flow/bulk_creator_test.rb`）

`TaskFlowBulkCreatorTest` にて以下のテストケースを定義・実行する：

| メソッド | 検証内容 |
| :--- | :--- |
| `test_ut_be_01_parent_branch_merge_and_soonest_start_with_non_working_days` | 親1件＋子4件（1対2分岐→1合流、`delay: 1`、非稼働日 `[6, 7]` 跨ぎ）。`Issue` 5件・`IssueRelation` 4件作成、`parent_id`/`lft`/`rgt`、Redmine `soonest_start` 確定日程と返却値の一致、親ロールアップ（`total_estimated_hours` 含む）を検証。 |
| `test_ut_be_02_topological_order_creation_and_group_nil_initialization` | 下流→上流・グループ末尾の入力順でもトポロジカル順に作成され、グループのダミー日程・工数が `nil` 初期化後に子から導出されることを検証。 |
| `test_ut_be_03_disabled_core_fields_ignored_via_safe_attributes` | `disabled_core_fields` に含まれる `fixed_version_id` が `safe_attributes=` によりエラーなく無視（`nil`）されることを検証。 |
| `test_ut_be_04_rollback_all_on_partial_validation_failure` | 3件中3件目のみ必須カスタムフィールド欠如時、全件ロールバック（`Issue.count` / `IssueRelation.count` 増加 0）および対象 `temp_id` のエラー返却を検証。 |
| `test_ut_be_05_pre_transaction_structural_and_limit_rejections` | 循環依存（`A→B→A`）、グループ端点エッジ、グループネスト、重複エッジ・自己ループ、存在しない `temp_id`、件数上限超過（`issues: 101`, `relations: 201`）の事前拒否を検証。 |

### 2.4 コントローラ結合テスト（`test/integration/task_flows_test.rb`）

`TaskFlowsTest` にて以下を検証する：

| メソッド | 検証内容 |
| :--- | :--- |
| `test_it_be_01_bootstrap_returns_expected_master_data` | `GET /projects/:identifier/task_flow/bootstrap.json` の `200 OK` と返却スキーマを検証。 |
| `test_it_be_02_permission_checks_module_disabled_and_404` | フル権限時は `200`＋メニュー表示。`:create_issues_via_flow`, `:add_issues`, `:manage_issue_relations` の各欠如時およびモジュール無効時は HTML/JSON とも `403`・メニュー非表示。存在しないプロジェクトは `404`。 |
| `test_it_be_03_csrf_protection_and_no_api_key_exposure` | `index` HTML に `@user.api_key` が含まれないこと、および `allow_forgery_protection = true` 時に CSRF トークンなしの `bulk_create.json` POST が `403` または `422` で拒否されることを検証。 |
| `test_it_be_04_bulk_create_success_and_validation_error_contracts` | 正常ペイロードで `201 Created`（`Issue` 2件・`IssueRelation` 1件作成）、空題名ペイロードで `422 Unprocessable Entity`（作成 0 件・`errors` 契約）を検証。 |

---

## 3. フロントエンド単体テスト仕様（Vitest: `frontend/tests/`）

現在 7 ファイル（計 31 テスト）が存在する：

| ファイル | 対象モジュール | テスト数 | 主な検証範囲 |
| :--- | :--- | :--- | :--- |
| `graphValidation.test.ts` | `domain/graphValidation.ts` | 6 | 1対多・多対1接続許可、自己ループ・重複・2ノード/多段循環・`groupNode` 接続拒否 |
| `datePropagation.test.ts` | `domain/datePropagation.ts` | 6 | 直列 `delay`、合流最大値、`dueDate: null` ガード、工数 `0`/`null` フォールバック、`lockDates` 保護、Group ロールアップ／空リセット |
| `storeAndLayout.test.ts` | `store/useFlowStore.ts`, `domain/autoLayout.ts` | 4 | `dagre` 左→右順序と非重複、Undo/Redo とドラッグ中間座標無視、Group 削除時デタッチと配列前方配置、`Tab` 継承・`Enter` 分岐・手動日付ロック |
| `persistence.test.ts` | `domain/persistence.ts` | 2 | `QuotaExceededError` 捕捉、JSON インポート時の無効 ID フォールバックと警告収集 |
| `client.test.ts` | `api/client.ts` | 1 | `X-CSRF-Token`・`X-Requested-With` 付与、HTML リダイレクト応答時の `SessionExpiredError` 検知 |
| `inspectorPanel.test.tsx` | `components/InspectorPanel.tsx` | 6 | 折りたたみ/展開、ノード追加・ダブルクリック時の自動展開とフォーカス、送信済み/エラー時操作、クリック伝播抑止 |
| `fullscreenToggle.test.tsx` | `App.tsx`, `components/ActionBars.tsx` | 6 | 全画面 ON/OFF と `aria-pressed`、`Esc` 解除、入力要素・モーダル表示中の `Esc` 抑止、状態保持、`isSubmitted` 時操作可 |

### 3.1 単体テストの未カバー領域

`FlowCanvas.tsx`、`ActionBars.tsx`、`TaskNode.tsx`、`GroupNode.tsx`、`DependencyEdge.tsx`、`ResultModal.tsx` の実 DOM 描画、React Flow 上のドラッグ＆ドロップ操作、Redmine CSS との非干渉、および実サーバーとの通信は Vitest の対象外であり、次の実ブラウザ検証で担保する。

---

## 4. 実ブラウザ E2E 検証シナリオ（Docker 上の Redmine `http://localhost:3000`）

JS / CSS / ERB / バックエンド変更時は、Docker 上の Redmine（`http://localhost:3000`）で以下を検証する。各シナリオは空の `localStorage` から開始する。

1. **初期表示・画面統合確認**:
   * 対象プロジェクトで `task_flow` モジュール有効化・3 権限付与時に「タスクフロー」タブが表示され、2 ペイン UI が Redmine ヘッダ／スタイルと干渉せず描画されること。
2. **キーボード操作によるフロー構築と分岐・合流**:
   * 「タスク追加」後、`Tab` で後続追加＋自動接続＋属性継承、`Enter` で並列ノード追加＋全先行タスクからの分岐接続、`Delete` で削除、`Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` で Undo/Redo できること。
3. **不正接続ブロック**:
   * 下流から上流への循環接続や親グループ枠への接続が拒否され、警告トーストが表示されること。
4. **親グループ枠の D&D 紐付けと枠削除**:
   * タスクをグループ枠内へドラッグ＆ドロップすると子紐付け・件数/合計工数/期間ロールアップが行われ、枠外ドラッグや「枠から外す」で解除、グループ枠削除時は子タスクが残ること。
5. **トラッカー連動・一括登録・確定日程同期・二重登録防止**:
   * `disabled_core_fields` による項目無効化と必須カスタムフィールド未入力時のクライアント側送信ブロック（赤枠表示・対象選択）を確認。
   * 正常データで「Redmineに一括登録」を実行し、`201` 完了モーダルと各ノードの `#チケット番号` リンク・Redmine 確定日程（非稼働日スキップ反映）の同期、および送信後ロック（「新規フローとしてリセット」で解除）を確認。Redmine チケット画面で親子・先行/後続関係・`delay`・カスタムフィールドが保存されていること。
   * サーバー側 `422` エラー時に全件ロールバックされ、エラーモーダルと対象ノードの赤枠表示が行われること。
6. **下書き自動復元・JSON 入出力**:
   * 編集後にページリロードして下書きが復元されること。「JSON出力」（コピー／ダウンロード）および別プロジェクトを含む「JSON読込」（フォールバック警告含む）が動作すること。
7. **権限・セキュリティ確認**:
   * `:create_issues_via_flow`, `:add_issues`, `:manage_issue_relations` のいずれかが欠如したユーザーではメニューが非表示となり、直アクセスで `403` が返ること。HTML ソースに API キーが出力されないこと。
8. **全画面表示トグル**:
   * ツールバーの「全画面」ボタンで Redmine ヘッダ／ナビゲーション／フッタを覆うビューポート全体表示（`fixed inset-0`、z-index 10000）へ切り替わり、`ResultModal`（10010）やトースト通知（10020）が前面に表示されること。ノード・エッジ・選択状態・Undo/Redo 履歴が保持され、入力欄外での `Esc` キーおよび「全画面解除」ボタンで元の埋め込み表示へ戻ること。
   * 780×493 と 1280×800 で上端の「タスク追加」を実クリックし、`elementFromPoint` でも前面表示を確認する。JSON 出力・一括登録成功／エラーモーダル・トーストの前面表示と閉じる操作も確認する。
   * 認証情報がない場合の限定検証として、[browser-check.js](fullscreen-layering/browser-check.js) を Playwright MCP の `browser_run_code_unsafe` の `filename` に指定して実行できる。事前に Redmine を起動し、プラグインルートから `python3 -m http.server 8787 --bind 127.0.0.1 --directory assets` でビルド済みアセットを配信する。この検証は実際のログイン画面の DOM/CSS にアプリをマウントし、Bootstrap と一括登録 API の応答のみを置き換える。認証済み画面・実 DB 保存の検証を代替しない。実行結果は [verification.md](fullscreen-layering/verification.md) を参照。
