# SPEC: フローデータの名前付き保存（最大5件）

## 1. Goal
- ユーザーが現在のタスクフローに名前を付けてブラウザ（`localStorage`）へ最大 5 件まで明示的に保存し、一覧から読込・上書き・削除できるようにする。
- 既存の自動下書き保存（1 件）とは独立した保存領域として管理し、複数パターンのフロー案を切り替えながら作業できるようにする。

## 2. Non-goals / Out-of-scope
- Redmine サーバー DB への保存、マイグレーション追加、バックエンド API（`bootstrap` / `bulk_create`）の変更。
- 異なるブラウザ・端末間や他ユーザー・他プロジェクト間での保存データ共有。
- 既存の自動下書き（`task_flow_draft_v1_${projectId}_${userId}`）の仕様変更や廃止。
- 保存データの JSON ファイル一括エクスポート／インポートやフォルダ分類・検索機能。

## 3. Acceptance Criteria
- [ ] **Happy Path（新規保存と永続化）:** 保存件数が 5 件未満の状態で、右上ツールバーの「保存・読込」ボタンからモーダルを開き、有効な保存名（空文字・空白のみ不可）を入力して新規保存すると、名前・保存日時・ノード数を含む項目が一覧に追加され、ページ再読み込み後も一覧に保持される。
- [ ] **Happy Path（読込と Undo 連携）:** 一覧の保存項目に対して読込を実行すると、現在のキャンバスが当該フロー（`isSubmitted: false`、`createdIssueId: null` 正規化済み）へ切り替わり、自動下書きにも反映される。読込操作は Undo 履歴に積まれ、`Undo` で読込前の状態へ戻せる。
- [ ] **Happy Path（上書き・削除）:** 一覧の既存項目に対して「上書き保存」を実行すると件数を増やさずに現在のフロー内容と更新日時で差し替えられ、「削除」を実行すると一覧と `localStorage` から当該項目が削除される。
- [ ] **Error / Boundary Case（5 件上限）:** 保存件数が 5 件に達している状態で新規保存しようとすると、上限エラーメッセージを表示して保存をブロックする（新規保存ボタンの無効化または送信時エラー表示）。既存項目を上書きまたは削除すると、再び新規保存が可能になる。
- [ ] **Error / Boundary Case（不正入力・ストレージ保護）:** 保存名が空または空白のみの場合は保存を許可せずバリデーションエラーを表示する。`localStorage` の読み書きで `QuotaExceededError` 等の例外が発生した場合や保存 JSON が破損している場合も、アプリをクラッシュさせずエラー通知または安全なフォールバックを行う。
- [ ] **Overlay & Fullscreen:** 保存・読込モーダルは通常表示・全画面表示のいずれでもエディタ本体および Redmine 固定ヘッダより前面に表示され、`Escape` キーまたは閉じるボタンでモーダルのみを閉じられる（全画面状態は維持する）。
- [ ] **Backward Compatibility:** 送信済み状態（`isSubmitted: true`）でも保存モーダルの開閉・新規保存・読込が可能であり、既存の自動下書き復元・JSON 入出力・一括登録および既存テストがすべて通る。

## 4. Public API / DB Schema
- None。公開 API・リクエスト／レスポンス・DB スキーマの変更はない。
- クライアント側 `localStorage` にプロジェクト×ユーザー単位の専用キー（例: `task_flow_saved_v1_${projectId}_${userId}` `[ASSUMPTION]`）を追加し、最大 5 件の保存配列（各要素に `id`, `name`, `updatedAt`, `data: SerializedFlowData`）を保持する。

## 5. Constraints
- **Security:** 保存データには機密情報（API キー等）を含めない。読込時は既存のサニタイズ処理（`parseAndSanitizeFlowJson` 相当）を通し、無効なトラッカー／ステータス／担当者／バージョン／カスタムフィールド ID を安全にフォールバックする。
- **Performance:** `localStorage` アクセスはすべて `try/catch` で保護し、ノード・エッジ編集ごとの自動保存は既存の自動下書きのみで行う（名前付き保存領域への自動書き込みは行わない）。
- **Assumptions（要確認）:**
  - `[ASSUMPTION]` 保存名の最大長は 50 文字とし、前後空白はトリムする。同名保存の可否は重複許可（`id` で一意識別）とする。
  - `[ASSUMPTION]` 保存時は `createdIssueId: null`・`selected: false` に正規化し、未送信のテンプレート／作業データとして保存する。
  - `[ASSUMPTION]` 右上ツールバーの「保存・読込」ボタンは、既存のアイコンボタン仕様（`w-10 h-10 rounded-xl`、下向きツールチップ `top-full mt-2`）に準拠する。
- **Documentation:** 実装時に `docs/02-canvas-and-nodes.md`、`docs/05-persistence-and-bulk-create.md`、`docs/06-testing-and-verification.md` を最終仕様に合わせて更新する。

## 6. Required Tests
- **Unit:** `frontend/tests/` に保存・上限（5 件）・上書き・削除・プロジェクト/ユーザー分離・バリデーション（空文字）・`QuotaExceededError` / 破損 JSON 耐性・読込時の Undo 履歴およびサニタイズを検証する Vitest テストを追加する。
- **Integration / E2E:** Docker 上の Redmine（`http://localhost:3000`）に実ブラウザでアクセスし、新規保存（5 件まで）、6 件目の上限エラー、上書き、削除、リロード後の保持、読込と Undo、全画面表示中のモーダル操作を確認する。
- **Regression:** `frontend/` で `npm test` と `npm run build` を実行し、既存の全テストおよびビルドが成功することを確認する。
