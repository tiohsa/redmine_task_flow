# SPEC: JSON出力ダイアログのスキーマ定義表示・コピー機能

## 1. Goal
- JSON 出力ダイアログ（`frontend/src/components/ResultModal.tsx` の JSON エクスポート表示）に、出力されるフロー JSON（`SerializedFlowData`, `schema_version: 1`）の **スキーマ定義を表示するボタン** を追加する。
- スキーマ定義の表示領域に、表示中のスキーマ定義テキストをクリップボードへコピーできる **コピーアイコンボタン** を追加し、ユーザーが外部ツールや AI 連携向けにスキーマを即座に参照・取得できるようにする。

## 2. Non-goals / Out-of-scope
- エクスポートされるフロー JSON フォーマット（`schema_version: 1`、`SerializedFlowData`）自体の仕様変更。
- JSON 読込（インポート）時の JSON Schema バリデーションエンジンの導入・変更。
- バックエンド API（`bootstrap` / `bulk_create`）、Ruby コントローラー／サービス、DB スキーマ、ルーティングの変更。
- 一括起票結果モーダル（`created` / `validation_error` / `submit_error` モード）および `SavedFlowsModal.tsx` の UI 変更。

## 3. Acceptance Criteria
- [ ] **Happy Path（スキーマ定義の表示切替）:** JSON 出力ダイアログを開いた状態で「スキーマ定義を表示」ボタンをクリックすると、プレビュー領域に出力 JSON ではなく JSON スキーマ定義が表示される。再度ボタン（「出力JSONに戻る」）をクリックすると、出力 JSON 表示に戻る。
- [ ] **Happy Path（スキーマ定義のコピー）:** スキーマ定義が表示されている状態でコピーアイコンボタン（`aria-label="スキーマ定義をコピー"`）をクリックすると、`navigator.clipboard.writeText` がスキーマ定義文字列を引数に呼び出され、成功トースト（`success`: `スキーマ定義をクリップボードにコピーしました`）が表示される。
- [ ] **Happy Path（スキーマ定義の妥当性）:** 表示・コピーされるスキーマ定義は `JSON.parse` 可能な有効な JSON Schema（Draft 2020-12）文字列であり、`schema_version`（`1`）、`baseDate`、`nodes`（`taskNode` / `groupNode` および `data` 内の各フィールド）、`edges`（`dependencyEdge` および `data.delay`）の型・必須項目定義を含む。
- [ ] **Error / Boundary Case（クリップボードコピー失敗）:** `navigator.clipboard.writeText` が失敗（Promise reject 等）した場合でも例外でクラッシュせず、既存の「JSONをコピー」と同様に警告トースト（`warning`: `クリップボードへのコピーに失敗しました`）が表示される。
- [ ] **Error / Boundary Case（再オープン時の状態リセット）:** スキーマ定義を表示した状態でダイアログを閉じ、再度 JSON 出力ダイアログを開いた場合、表示モードは初期状態（出力 JSON 表示）にリセットされている。
- [ ] **Accessibility & Layout:** スキーマ表示切替ボタンおよびコピーアイコンボタンはキーボードでフォーカス・操作でき、適切な `aria-label`（トグルボタンには `aria-pressed`）を持つ。通常表示および全画面表示のいずれでも既存ボタン（`JSONをコピー` / `ダウンロード` / `閉じる`）のレイアウトを崩さない。
- [ ] **Backward Compatibility:** 既存の「JSONをコピー」「ダウンロード」「閉じる」の動作、一括起票結果モーダル表示、および既存の全テストが引き続きパスする。

## 4. Public API / DB Schema
- None。公開 API・リクエスト／レスポンス・DB スキーマの変更はない。

## 5. Constraints
- **Security:** スキーマ定義は静的なデータ構造定義のみとし、プロジェクト固有の機密情報・API キー・ユーザー識別情報を含めない。
- **Performance:** スキーマ定義文字列は静的定数として定義し、モーダル開閉や再レンダリングごとに過剰な計算を行わない。
- **CSS / TypeScript:** `.task-flow-root` スコープおよび `tsconfig.json` の `strict: true` を維持する。

## 6. Required Tests
- **Unit (`frontend/tests/`):**
  - スキーマ表示ボタンによる「出力 JSON」⇔「スキーマ定義」の表示切替と、ダイアログ再オープン時の初期状態リセットを検証する Vitest テスト。
  - コピーアイコンボタンクリック時の `navigator.clipboard.writeText` 呼び出し（成功トースト・失敗時 `warning` トースト）を検証する Vitest テスト。
  - スキーマ定義文字列が有効な JSON であり、`schema_version`, `baseDate`, `nodes`, `edges` 等の必須構造を含むことを検証するテスト。
- **Integration / E2E:**
  - Docker 上の Redmine（`http://localhost:3000`）に実ブラウザでアクセスし、JSON 出力ダイアログからスキーマ定義の表示切替、コピーアイコンのクリックとトースト通知、および既存の JSON コピー・ダウンロード・閉じる操作が正常に動作することを確認する。
- **Regression:**
  - `frontend/` で `npm test`（Vitest 全件パス）および `npm run build`（`tsc -b && vite build` 成功）を実行する。
