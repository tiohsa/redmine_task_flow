# 実装タスク — ノードのチケット属性を一括変更

**入力** [仕様](SPEC.md) · [実装計画](plan.md) · [調査](research.md) · [データモデル](data-model.md) · [編集契約](contracts/editor.md) · [一括登録契約](contracts/bulk-create.md) · [検証手順](quickstart.md)

パスはプラグインルート基準。`[P]` は前提タスクの完了後に別ファイルで並行作業できるタスクを示す。Vitest と Minitest のテスト名は該当する BNE ID で始め、外部 I/O だけを差し替える。各ケースを 5 検証・40 行以内に分け、ノードの値、画面表示、履歴、下書き、DB の結果を必要に応じて検証する。

## Phase 1 — 準備

- [X] T001 `frontend/package.json`、`verification/start-e2e.sh`、`docs/bulk-node-edit/quickstart.md` に沿って既存の Node.js、Docker、Chromium を用意し、評価用プロジェクトのトラッカー、カスタムフィールド、担当者、バージョン、評価用ロールを準備する。

## Phase 2 — 共通の土台

- [X] T002 `frontend/src/features/bulk-node-edit/index.ts` に評価関数の契約と公開の入力・結果型を定義する。`docs/bulk-node-edit/data-model.md` の `BulkNodeEditRequest.nodeIds`、`BulkNodeEditRequest.changes`、`BulkNodeEditChanges.trackerId`、`BulkNodeEditChanges.priorityId`、`BulkNodeEditChanges.assignedToId`、`BulkNodeEditChanges.fixedVersionId`、`BulkNodeEditResult` を型に対応させる。評価本体は T006 で接続する。

## Phase 3 — US1　対象に属性をまとめて反映する（P1）

対象は AC-01〜06、AC-08、AC-10 の編集適用部分。

独立検証では、タスクと親グループ枠をキーボードで選び、指定した属性だけを変更する。未選択の子ノードと既存属性を比較し、無効な指定・選択件数・消失対象で全件停止することを確認する。

### テスト

- [X] T003 [P] [US1] `frontend/tests/bulkNodeEdit.test.ts` に、公開入口経由で BNE-01〜BNE-05、BNE-08、BNE-10 の判定テストを追加する。異なる現トラッカー、非互換ステータス、候補にない値、明示解除、無変更、旧形式の ID、件数境界、消失対象を確認する。
- [X] T004 [P] [US1] `frontend/tests/bulkNodeEditDialog.test.tsx` に BNE-01〜BNE-05、BNE-08、BNE-10 の画面テストを追加する。入口の有効化、初期値、全解除、項目表示、候補更新、理由と件数、取消、失敗時の入力保持と修正後の適用を確認する。フォーカス移動とキーボード動作は T020 の実ブラウザーでも検証する。
- [X] T005 [P] [US1] `frontend/tests/bulkNodeEditStore.test.ts` に BNE-04、BNE-05、BNE-08、BNE-10 のストアテストを追加する。送信中・送信済み、権限に合わない値、対象消失、上限超過、保存失敗でノード・履歴・下書きを保持し、失敗理由を返すことと修正・再試行を検証する。

### 実装

- [X] T006 [US1] `frontend/src/features/bulk-node-edit/internal/domain/bulkEdit.ts` に、候補、件数、対象、指定値、ステータス維持、差分の純粋な判定と変更案の生成を実装し、`frontend/src/features/bulk-node-edit/index.ts` から公開する。制約は `docs/bulk-node-edit/data-model.md` の `BulkNodeEditRequest.nodeIds`、`BulkNodeEditRequest.changes`、`BulkNodeEditChanges.trackerId`、`BulkNodeEditChanges.priorityId`、`BulkNodeEditChanges.assignedToId`、`BulkNodeEditChanges.fixedVersionId`、`BulkNodeEditResult`、`TaskFlowNode.data` に従う。
- [X] T007 [P] [US1] T006 後に `frontend/src/store/useFlowStore.ts` へ `applyBulkNodeEdit` を追加する。最新の状態で公開入口を評価し、`docs/bulk-node-edit/data-model.md` の `SerializedFlowData` を既存の `frontend/src/domain/persistence.ts` で先に保存する。保存成功後に `TaskFlowNode.data` と `FlowSnapshot` の制約に沿ってノード・履歴・変更対象の古い検証エラーを一度に更新する。失敗は同文書の `BulkNodeEditResult` に従って返す。
- [X] T008 [P] [US1] T006 後に `frontend/src/components/BulkNodeEditDialog.tsx` と `frontend/src/index.css` に、選択・指定・件数・理由を表示するダイアログを実装する。`docs/bulk-node-edit/contracts/editor.md` と `docs/bulk-node-edit/data-model.md` の一括編集入力・画面状態遷移に従い、公開入口と親から渡す適用操作を使う。CSS はルート配下に置く。
- [X] T009 [US1] T007 と T008 後に `frontend/src/App.tsx`、`frontend/src/components/FlowCanvas.tsx`、`frontend/src/components/ActionBars.tsx` を接続する。入口を編集可能な状態に連動させ、ツールバーとダイアログで Tab / Enter がキャンバス編集を起動しないようにし、Shift+Tab でキャンバスから移動できるようにする。モーダル中の Esc は全画面に影響させず、閉じる操作を React の状態と同期する。
- [X] T010 [US1] `frontend/tests/bulkNodeEdit.test.ts`、`frontend/tests/bulkNodeEditDialog.test.tsx`、`frontend/tests/bulkNodeEditStore.test.ts` を実行し、対象・指定・再試行の公開結果を確認する。

## Phase 4 — US2　適用結果を戻して作業を再開する（P2）

対象は AC-06 の Undo/Redo と下書き復元。

独立検証では、1 回の適用を Undo / Redo 各 1 回で戻して再適用し、再読み込み後の全対象の属性とカスタムフィールドを確認する。

### テストと統合

- [X] T011 [P] [US2] `frontend/tests/bulkNodeEditHistory.test.ts` に BNE-06 を追加する。既存の Undo/Redo 操作を通し、一括の履歴 1 件、再適用、自動下書きの 1 回の書き込み、再初期化後の復元、無効なカスタムフィールドの除外を確認する。保存回数に加えて保存した具体値を検証する。
- [X] T012 [US2] T007 と T011 後に `frontend/src/store/useFlowStore.ts` の既存 Undo/Redo と初期化の入口で、`docs/bulk-node-edit/data-model.md` の `FlowSnapshot`、`SerializedFlowData`、`TaskFlowNode.data` に沿った復元を確認する。`frontend/tests/bulkNodeEditHistory.test.ts` に加え `frontend/tests/savedFlows.test.tsx` と `frontend/tests/persistence.test.ts` を実行し、契約との差があれば同じ入口で修正する。

## Phase 5 — US3　一括変更後のフローを起票する（P3）

対象は AC-07、AC-09、AC-10 の起票・失敗部分。

独立検証では、変更済みの小規模フローで必須項目による停止と補完後の起票を確認する。編集開始後の権限取り消しと保存失敗では、作成 0 件、エラー表示、フロー保持と再試行を確認する。

### テスト

- [X] T013 [P] [US3] `frontend/tests/bulkNodeEditSubmit.test.ts` に BNE-07、BNE-09、BNE-11 を追加する。一括適用後の必須検証・補完操作、送信した項目、JSON または本文なしの 403、422 詳細、下書き保持、再登録をストア操作と fetch 境界で検証する。起票した親子・依存関係は T020 で確認する。
- [X] T014 [P] [US3] `test/integration/task_flows_test.rb` に BNE-09 を追加する。3 権限をそれぞれ欠くとメニューと直アクセスが拒否されること、全権限で編集画面を開いた後に権限を取り消すと有効な登録ペイロードでも 403 となり、チケット・関連が作成されないことを確認する。
- [X] T015 [P] [US3] `test/unit/task_flow/bulk_creator_test.rb` の UT-BE-04 で後続チケットの保存失敗を検証し、BNE-11 で親子間へ先行関係を保存するときの失敗を公開サービスで再現する。具体的なエラー、チケットと関連の全件ロールバック、原因を解消した再試行を確認する。

### 実装

- [X] T016 [US3] `frontend/src/api/client.ts` の一括登録で 403 と既存の JSON エラーを扱い、本文がないときに権限不足を表示する。`frontend/tests/client.test.ts` でセッション切れのリダイレクトと CSRF 付与の回帰を確認する。[一括登録契約](contracts/bulk-create.md)
- [X] T017 [US3] T007 と T013〜T016 後に `frontend/src/store/useFlowStore.ts` の `submitBulkCreate`、`frontend/src/components/InspectorPanel.tsx`、`app/controllers/task_flows_controller.rb` を通すテストを実行する。必須項目の補完、起票後の属性と関係、拒否・失敗時の保持を確認する。既存の認証・CSRF・3 権限・属性制御を維持する。

## Phase 6 — 文書同期と総合検証

- [X] T018 [P] 利用者向け入口、境界ケースと E2E の説明を `docs/02-canvas-and-nodes.md`、`docs/06-testing-and-verification.md`、`docs/bulk-node-edit/SPEC.md` と同期する。
- [X] T019 [P] `verification/feature-map.json` に一括変更ボタンのセレクターとシナリオを追加し、Vitest、Minitest、認証済み実ブラウザーの対応先を関連付ける。
- [X] T020 T010、T012、T017〜T019 後に `docs/bulk-node-edit/quickstart.md` の手順で `node verification/verify-cli.mjs`、フロントエンドのビルド、`bash verification/start-e2e.sh` と認証済み実ブラウザーを実行する。`assets/javascripts/task_flow.js` と `assets/stylesheets/task_flow.css` はビルドで生成する。検証コマンド、結果、環境上の未確認項目を報告する。

## 依存関係と並行作業

- 準備 → 公開契約 → US1。US1 の適用結果が US2 と US3 の統合の前提になる。US3 の Rails テストと API 応答処理は、US1 の画面完成を待たず既存入口で検証できる。
- US1 では公開入口・ダイアログ・ストアのテスト（T003〜T005）を別ファイルで進められる。T006 後はストア（T007）とダイアログ（T008）が並行できる。
- US2 の履歴テスト（T011）は、適用の公開契約が固まり次第、US1 の画面作業と並行で書ける。検証は T007 に依存する。
- US3 のフロントエンド、ルート、サービスのテスト（T013〜T015）は並行できる。統合検証の T017 は適用と 403 処理を含む。
- 文書・機能マップの更新（T018、T019）は仕様確定後に並行できる。総合検証（T020）は全ストーリーと文書同期の後に実行する。

## 実装順序

最初に US1 で選択・候補・全件適用を確認し、その時点で単一の履歴記録と下書き保存まで実装する。次に US2 で Undo/Redo と復元を独立して検証する。US3 を統合し、起票成功、権限取り消し、保存失敗を認証済み環境で確認してから全体を完了とする。

## Phase 7: Convergence

- [X] T021 CRITICAL `frontend/tests/bulkNodeEditDialog.test.tsx` で、担当者の「未割当」と対象バージョンの「なし」、対象選択とトラッカー変更に伴う候補更新、非互換ステータスの対象と理由、全解除後の 0 件表示、101 件から 100 件への選び直しと適用、消失対象の表示・解除と再適用を、ダイアログ操作と結果から回帰検証する per Constitution III / T004 / AC-02〜05 / AC-08 / AC-10 / BNE-02〜05 / BNE-08 / BNE-10 (partial)
- [X] T022 CRITICAL `frontend/tests/bulkNodeEdit.test.ts`、`frontend/tests/bulkNodeEditStore.test.ts`、`frontend/tests/bulkNodeEditHistory.test.ts` と画面テストで、旧形式の数値文字列 ID の照合と差分判定、候補にない値や取消でノード・履歴・下書きが変わらないこと、無効値の修正後の再適用、100 件への適用結果を Undo 1 回で全件戻せることを公開入口から回帰検証する per Constitution III / T003 / T004 / T005 / AC-05 / AC-06 / AC-08 / AC-10 / BNE-05 / BNE-08 / BNE-10 (partial)
- [X] T023 `docs/bulk-node-edit/quickstart.md` に沿って総合検証と認証済み実ブラウザーの実施結果を確認し、確認できないシナリオを評価用 Redmine で実行する。検証 CLI、Minitest、キーボード操作と件数境界、下書き復元、権限取り消し、起票失敗と修正後の再試行について、コマンドとシナリオ単位の成否、環境制約を記録する per T020 / plan: 認証済み実ブラウザー検証 / Constitution IV (partial)

## Phase 8: Convergence

- [X] T024 CRITICAL `frontend/tests/bulkNodeEditStore.test.ts` で、フロー内に 2 件以上のノードがある状態から選択 0 件・1 件、変更指定なし、差分なしを公開 `applyBulkNodeEdit` に渡し、各拒否理由とノード・Undo/Redo 履歴・保存済み下書きの保持を検証する。既存の拒否・ストレージ失敗テストも操作前の値を複製して比較し、ノードや履歴が直接書き換えられる回帰を検出する per Constitution III / AC-05 / BNE-05 / T005 / T022 (partial)
- [X] T025 CRITICAL `frontend/tests/bulkNodeEditHistory.test.ts` の BNE-06 で、Undo/Redo の前に適用直後の自動下書きを読み、v1 形式で保存された変更対象全件と選択外ノードの値、エッジ、基準日を具体値で検証する。適用時の書き込み 1 回と、既存経路での Undo/Redo・再初期化後の復元も検証する per Constitution III / AC-06 / BNE-06 / T011 (partial)
- [X] T026 `frontend/src/features/bulk-node-edit/internal/domain/bulkEdit.ts` と `frontend/src/components/BulkNodeEditDialog.tsx` で、件数違反と同時に発生した対象消失・無効値・非互換ステータスの理由を該当対象または項目とともに表示し、適用を拒否する。保存失敗の表示で最新の判定理由が隠れないようにする。非互換ノードを残して選択を 1 件に減らした場合と、理由を解消して適用できる場合を公開入口とダイアログで回帰検証する per AC-04 / AC-10 / BNE-04 / BNE-10 / T004 / T006 / T008 (partial)
- [X] T027 `frontend/src/store/useFlowStore.ts` の一括登録処理で、422 応答の同一 `temp_id` に属するメッセージを応答順にまとめ、既存のエラー詳細に全件表示する。`frontend/tests/bulkNodeEditSubmit.test.ts` の BNE-11 で、同一ノードに複数の詳細が返る場合の表示、編集と下書きの保持、修正後の再登録を公開操作と fetch 境界で検証する per AC-10 / BNE-11 / T013 / T016 / T017 / contracts/bulk-create.md (partial)
- [X] T028 `frontend/src/App.tsx` から `frontend/src/components/BulkNodeEditDialog.tsx` に一括適用のコールバックを渡す。ダイアログは選択 ID と指定値を渡し、既存ストアによる最新状態での再判定、保存成功時の閉鎖、失敗時の入力保持を画面テストで確認する per T008 (partial)
