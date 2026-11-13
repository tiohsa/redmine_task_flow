# SPEC: 全画面表示の重なり順の修正

## 1. Goal
- 全画面エディタが Redmine の固定ヘッダに隠れる Major を解消し、上部ツールバーとモーダル・通知を操作可能にする。
- 再現条件はビューポート幅 780px。Redmine のヘッダは高さ 64px、`z-index: 9999` であり、現行の全画面エディタ（`z-index: 40`）より前面に残る。

## 2. Non-goals / Out-of-scope
- Browser Fullscreen API の導入、全画面状態の永続化、ツールバーの全面的なレスポンシブ再設計。
- Redmine 本体や他プラグインの CSS 修正、認証・権限・一括登録 API・DB・日程計算の変更。
- 任意の第三者テーマが設定する無制限な重なり順への対応。

## 3. Acceptance Criteria
- [ ] **Happy Path:** Docker 上の Redmine で幅 780px、高さ 493px の画面から全画面に切り替えると、エディタがビューポート全体を覆い、ヘッダが元々占める上端 64px でもエディタのツールバーが表示・操作できる。幅 1280px、高さ 800px でも同じ結果になる。
- [ ] **Overlay:** 全画面中に JSON 出力・一括登録の成功／エラーモーダル・トーストを表示すると、いずれもエディタと Redmine ヘッダの前面に表示され、閉じる操作ができる。
- [ ] **Error / Boundary Case:** 入力要素へのフォーカス中、または結果／JSON 出力モーダル表示中の Escape では全画面が解除されない。それ以外の Escape と「全画面解除」ボタンでは埋め込み表示へ戻る。
- [ ] **Restoration:** 全画面への切替・解除を繰り返してもノード・エッジ・選択・Undo/Redo 履歴を保持し、解除後は Redmine のヘッダとナビゲーションを通常どおり操作できる。
- [ ] **Backward Compatibility:** 送信済み状態でも切替可能であり、切替による Bootstrap 再取得や全画面状態の URL／localStorage 保存を追加しない。既存テストをすべて通す。

## 4. Public API / DB Schema
- None。公開 API・リクエスト／レスポンス・DB スキーマの変更はない。

## 5. Constraints
- **Security:** Rails セッション認証・3 権限検証・CSRF 保護を維持し、API キーを出力しない。
- **Performance:** 切替による追加 API 通信を発生させない。
- **Compatibility:** `.task-flow-root` の CSS スコープと既存の全画面表示方式を維持する。重なり順の具体値は実装判断とし、エディタだけを前面化してモーダル・トーストを背面に残さない。
- **Scope:** 修正対象は全画面表示とオーバーレイの重なり順、および直接必要な回帰テスト・仕様更新に限定する。生成 JS/CSS はフロントエンドのビルドで更新する。
- **Documentation:** 実装時に `docs/02-canvas-and-nodes.md` と `docs/06-testing-and-verification.md` の重なり順・検証シナリオを最終的な動作に合わせて更新する。

## 6. Required Tests
- **Unit:** `frontend/tests/fullscreenToggle.test.tsx` で切替、Escape 抑止、状態保持、送信済み状態の操作を維持する。重なり順は CSS クラス文字列の一致だけで合格としない。
- **Integration / E2E:** Docker 上の Redmine の認証済みタスクフロー画面を実ブラウザで開き、上記 2 サイズで切替・解除を確認する。ヘッダとの重なり領域でスクリーンショットと `elementFromPoint` または実クリックにより、エディタが前面で操作可能なことを確認する。各モーダル・トーストも同様に前面表示と閉じる操作を確認する。
- **Regression:** `frontend/` で `npm test` と `npm run build` を成功させる。実ブラウザでノード移動・エッジ接続・Undo/Redo が全画面切替前後に動作し、解除後の Redmine ナビゲーションが復元することを確認する。
- **Evidence:** 実行コマンド、テスト結果、ブラウザ検証の画面サイズと結果を記録する。認証などの環境制約で実行できない項目は `UNVERIFIED` とし、検証済みとして扱わない。
