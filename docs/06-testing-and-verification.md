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

### 1.2 実ブラウザー E2E 用のデータベースと起動手順

プラグインルートで `bash verification/start-e2e.sh` を実行する。親 Compose の `db` を起動または再利用し、同じ MariaDB に `redmine_task_flow_e2e` を作成する。評価専用の Redmine はこの DB だけに接続できるアカウントを使い、ホストの `127.0.0.1:3001` に公開される。通常の Redmine は `http://localhost:3000` を使う。

| 項目 | 値 |
| :--- | :--- |
| 評価プロジェクト | `http://127.0.0.1:3001/projects/task-flow-e2e/task_flow` |
| ログイン | `task-flow-e2e` |
| パスワード | `task-flow-e2e-local` |

- 初回は DB のマイグレーションと Redmine の既定データの投入を行い、タスクフローを有効にした非公開プロジェクトと起票権限を持つ非管理者ユーザーを作成する。
- 再実行してもプロジェクトやユーザーは重複せず、E2E で作成したチケットは DB ボリュームに保持される。
- フロントエンドの変更を確認するときは `npm --prefix frontend run build` を実行する。プラグインの変更を読み直すには `docker compose -f ../../docker-compose.yml -f verification/compose.e2e.yml restart task-flow-e2e` を実行する。
- DB の準備や起動が失敗した場合はスクリプトが非ゼロで終了する。通常の `redmine` DB への接続は、評価用アカウントでは拒否されることを確認する。
- 終了時は `docker compose -f ../../docker-compose.yml -f verification/compose.e2e.yml stop task-flow-e2e` で評価用 Redmine を停止できる。

### 1.3 Rails テスト実行前提とコマンド

* **全テスト実行（プラグインルートから）**。同じ MariaDB に `redmine_task_flow_test` を用意し、専用アカウントと `RAILS_ENV=test` を使う一時コンテナでマイグレーションと Minitest を実行する。初回はテスト用 gem の取得に RubyGems への接続が必要。2 回目以降は Docker ボリューム内の gem を再利用する。
  ```bash
  bash verification/run-minitest.sh
  ```
* **単一ファイル実行例**:
  ```bash
  bash verification/run-minitest.sh plugins/redmine_task_flow/test/unit/plugin_test.rb
  ```
* **Docker を使わない場合（Redmine 本体ルートから）**。専用の `test:` DB を `config/database.yml` に設定し、マイグレーションを実行する。
  ```bash
  RAILS_ENV=test bundle exec rails test plugins/redmine_task_flow/test
  ```

### 1.4 フロントエンド ビルド・テストコマンド（`frontend/package.json`）

`frontend/` ディレクトリで実行する。

* **単体テスト（Vitest）**: `npm test`（`vitest run`）
* **型チェック＆本番バンドルビルド**: `npm run build`（`tsc -b && vite build` → `../assets/javascripts/task_flow.js` および `../assets/stylesheets/task_flow.css` へ出力）

### 1.5 統合検証

プラグインルートで `node verification/verify-cli.mjs` を実行する。`npm --prefix frontend run --silent verify:all` でも同じ検証が実行される。Node.js・Ruby とインストール済みのフロントエンド依存を用意する。

- 全体検証は、機能マップ、境界・仕様対応・テスト品質のチェックとその回帰テスト、TypeScript、Vitest、一時ディレクトリへの Vite ビルド、Docker 上の Minitest、Playwright の順に実行する。Minitest の専用 test DB は §1.3 のスクリプトで準備する。
- ブラウザースモークには既存の Playwright と Chromium を使う。Playwright を通常のモジュール検索で読み込めない場合は `TASK_FLOW_PLAYWRIGHT_MODULE` にモジュールディレクトリの絶対パスを設定する。インストール済みの Chrome を使用する場合は `TASK_FLOW_BROWSER_CHANNEL=chrome` を指定する。接続先は `TASK_FLOW_REDMINE_URL` で指定でき、既定値は `http://localhost:3000`。
- スモークは [既存のシナリオ](fullscreen-layering/browser-check.js) を呼び出し、Redmine のログイン画面で一時ビルドした JS/CSS と模擬 API を使って全画面、ノード追加、モーダル、エラー表示を確認する。認証後の権限、実 DB への保存、D&D、下書き復元は §4 の実環境シナリオに従って確認する。
- `node verification/verify-cli.mjs --local` は機能マップ、静的チェックとその回帰テスト、TypeScript、Vitest、Vite を実行する。Docker・ブラウザーを用意できない場合や GitHub Actions で使う。
- 標準出力は `status`、`scope`、各チェックの `durationMs` と成否、`metrics`、スクリーンショットの `artifacts` を含む JSON。全体検証では Chrome 起動を含むブラウザースモークの所要時間を `metrics.browserSmokeDurationMs` に出力する。機能マップで定めた上限（60 秒）を超えるか、選んだ範囲のチェックが失敗した場合は終了コード 1 を返す。実行ログは標準エラー出力に出す。[機能とチェックの対応](../verification/feature-map.json)

### 1.6 境界チェックと Ratchet Mode

`node verification/check-architecture.mjs` は既存の TypeScript 7 の AST と Ruby 標準の Ripper を使う。TypeScript は `tsconfig.json` の対象に含まれる `frontend/src/` と `frontend/tests/`、Ruby は `app/`、`config/`、`test/` 配下の `.rb` と `init.rb` を検査する。モジュール境界は TypeScript の相対パス、Vite の `/src/` パス、Ruby の明示的な機能定数参照と読み込みを対象とする。動的な Ruby 定数参照や別名による間接参照はコードレビューで確認する。

テストは機能の公開入口を使う。静的チェックは抑止コメント、製品モジュールへの直接の `vi.mock`／`vi.doMock` や Ruby の `TaskFlow` 定数への `stub`、曖昧なアサーション、スパイだけのアサーション、1 ケースあたり 5 検証・40 行の上限を検査する。テストデータの用意や外部 I/O の差し替えにはブラウザー API や Rails の fixture を使える。期待値や実装を写したテスト、間接的なモックはレビューで確認する。[テスト品質ルール](../agents/rules/testing-anti-patterns.md)

新規機能の各ディレクトリに公開入口を置き、`docs/<feature>/SPEC.md` に ``- 正常系 `TEST-ID` 条件`` と、該当する `境界値` または `失敗系` の行を記載する。Ruby の機能名のアンダースコアは仕様書のパスではハイフンに変換する。静的チェックは各 ID で始まる Vitest のテスト名または Rails の `test '...'` が登録されていることを確認する。受け入れ条件を実際に検証しているかはレビューで確認する。[記載例](../verification/_reference-example/README.md#公開契約とテスト)

ベースラインはファイルパス、ルール、対象、前後の空白を除いたソース行と、その重複数を照合する。ケース単位の違反にはケースの内容の SHA-256 も記録する。行番号の移動は許容し、ケース内を変更して同じ違反が残ると失敗する。違反が増えるか、解消済みの例外が残ると失敗する。例外を解消した PR では `node verification/check-architecture.mjs --print-baseline` で現在の候補を確認し、対応する行を [既存例外一覧](../verification/architecture-baseline.json) から削除する。

GitHub Actions の PR 検証では、ベースブランチの例外一覧が存在する場合に件数と内容を比較し、例外の追加を失敗として扱う。Actions の検証と CODEOWNERS レビューをマージ条件にする場合は、対象ブランチのルールセットで `verify-local` とコードオーナーの承認を必須にする。

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

現在 11 ファイル（計 53 テスト）が存在する。

| ファイル | 対象モジュール | テスト数 | 主な検証範囲 |
| :--- | :--- | :--- | :--- |
| `graphValidation.test.ts` | `domain/graphValidation.ts` | 6 | 1対多・多対1接続許可、自己ループ・重複・2ノード/多段循環・`groupNode` 接続拒否 |
| `datePropagation.test.ts` | `domain/datePropagation.ts` | 6 | 直列 `delay`、合流最大値、`dueDate: null` ガード、工数 `0`/`null` フォールバック、`lockDates` 保護、Group ロールアップ／空リセット |
| `storeAndLayout.test.ts` | `store/useFlowStore.ts`, `domain/autoLayout.ts` | 4 | `dagre` 左→右順序と非重複、Undo/Redo とドラッグ中間座標無視、Group 削除時デタッチと配列前方配置、`Tab` 継承・`Enter` 分岐・手動日付ロック |
| `persistence.test.ts` | `domain/persistence.ts` | 4 | `QuotaExceededError` 捕捉、JSON インポート時の無効 ID フォールバックと警告収集、保存名バリデーション（空白・50文字上限）、名前付き保存データの正規化・破損 JSON 耐性・5件上限 |
| `savedFlows.test.tsx` | `components/SavedFlowsModal.tsx`, `store/useFlowStore.ts`, `App.tsx` | 5 | 5件までの新規保存・再初期化後保持・6件目上限エラー・削除後再保存、読込（Undo 連携・自動下書き同期・`isSubmitted` 時操作・無効 ID フォールバック）、上書き保存、`QuotaExceededError` 耐性、全画面モーダル重なり順と `Esc` 抑止 |
| `client.test.ts` | `api/client.ts` | 1 | `X-CSRF-Token`・`X-Requested-With` 付与、HTML リダイレクト応答時の `SessionExpiredError` 検知 |
| `inspectorPanel.test.tsx` | `components/InspectorPanel.tsx` | 8 | 折りたたみ/展開、ノード追加・ダブルクリック時の自動展開とフォーカス、送信済み/エラー時操作、クリック伝播抑止 |
| `fullscreenToggle.test.tsx` | `App.tsx`, `components/ActionBars.tsx` | 6 | `aria-label` / `aria-pressed` による全画面 ON/OFF、`Esc` 解除、入力要素・モーダル表示中の `Esc` 抑止、状態保持、`isSubmitted` 時操作可 |
| `actionBars.test.tsx` | `components/ActionBars.tsx` | 5 | 全アイコンボタン（`保存・読込` 含む）の `aria-label` と下向きツールチップ（`top-full mt-2`）、件数バッジ、無効化境界条件、`isSubmitting` / `isSubmitted` / リセット表示、各クリックハンドラ |
| `cursorStyles.test.ts` | `index.css` | 2 | `.task-flow-root` スコープ内のカスタム grab/grabbing カーソル定義 |
| `resultModal.test.tsx` | `components/ResultModal.tsx` | 6 | エクスポート JSON とスキーマの切替、コピー成功・失敗、閉じて再表示したときの初期状態 |

### 3.1 単体テストの未カバー領域

ブラウザー上のレイアウトや重なり順、ホバー時のツールチップ、React Flow 上のドラッグ＆ドロップ操作、Redmine CSS との非干渉、および実サーバーとの通信は、次の実ブラウザー検証で確認する。

---

## 4. 実ブラウザ E2E 検証シナリオ（Docker 上の評価用 Redmine）

JS / CSS / ERB / バックエンド変更時は、§1.2 の評価用 Redmine（`http://127.0.0.1:3001`）で以下を検証する。各シナリオは空の `localStorage` から開始する。

1. **初期表示・画面統合・アイコンツールバー確認**:
   * 対象プロジェクトで `task_flow` モジュール有効化・3 権限付与時に「タスクフロー」タブが表示され、2 ペイン UI が Redmine ヘッダ／スタイルと干渉せず描画されること。
   * 左右ツールバーがアイコンボタン＋区切り線＋件数バッジで描画され、各アイコンへのホバー・フォーカス時に下向きツールチップ（`top-full mt-2`）がキャンバス上端で切れずに表示されること。
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
   * ツールバーの全画面アイコンボタン（`aria-label="全画面表示"`, `aria-pressed="false"`）で Redmine ヘッダ／ナビゲーション／フッタを覆うビューポート全体表示（`fixed inset-0`、z-index 10000）へ切り替わり、`ResultModal`（10010）やトースト通知（10020）が前面に表示されること。ノード・エッジ・選択状態・Undo/Redo 履歴が保持され、入力欄外での `Esc` キーおよび全画面解除アイコンボタン（`aria-label="全画面解除"`, `aria-pressed="true"`）で元の埋め込み表示へ戻ること。
   * 780×493 と 1280×800 で上端の「タスク追加」を実クリックし、`elementFromPoint` でも前面表示を確認する。JSON 出力・一括登録成功／エラーモーダル・トーストの前面表示と閉じる操作も確認する。
   * 認証情報がない場合の限定検証として、[browser-check.js](fullscreen-layering/browser-check.js) を Playwright MCP の `browser_run_code_unsafe` の `filename` に指定して実行できる。事前に Redmine を起動し、プラグインルートから `python3 -m http.server 8787 --bind 127.0.0.1 --directory assets` でビルド済みアセットを配信する。この検証は実際のログイン画面の DOM/CSS にアプリをマウントし、Bootstrap と一括登録 API の応答のみを置き換える。認証済み画面・実 DB 保存の検証を代替しない。実行結果は [verification.md](fullscreen-layering/verification.md) を参照。
9. **名前付きフロー保存（最大 5 件）**:
   * 「保存・読込」ボタンから `SavedFlowsModal` を開き、名前を付けて 5 件まで新規保存できること。6 件目の新規保存が上限エラーでブロックされること。
   * ページリロード後も 5 件の保存データが保持されること。
   * 保存一覧から「上書き保存」「削除」が動作し、削除後に再度新規保存できること。「読込」でキャンバスが切り替わり、自動下書きにも反映され、`Undo` で読込前へ戻せること。全画面表示中にモーダルを開き、`Esc` でモーダルのみ閉じて全画面が維持されること。
