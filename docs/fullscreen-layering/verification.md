# 全画面表示の重なり順：検証記録

実施日: 2026-11-13

## 自動チェック

- `frontend/` で `npm test`: PASS（7 ファイル、31 テスト）。切替・Escape 抑止・状態保持・送信済み状態の回帰を含む。
- `frontend/` で `npm run build`: PASS（TypeScript と Vite）。JS/CSS 生成物を更新。
- プラグインルートで `git diff --check`: PASS。

## 実ブラウザによる限定検証

Docker 上の Redmine のログイン画面へ、生成した JS/CSS のアプリを追加マウント。[browser-check.js](browser-check.js) で Bootstrap と一括登録 API を置き換え、実サーバーへの書き込みは行わない。テスト専用の project/user ID と下書きキーを使用する。

| 確認項目 | 結果 |
|---|---|
| 780×493 の全画面領域がビューポートと一致 | PASS |
| 同サイズの固定ヘッダ 9999 よりエディタ 10000 が前面 | PASS（`elementFromPoint` と「タスク追加」の実クリック） |
| 1280×800 の領域・上部ボタン操作 | PASS |
| 両サイズの JSON 出力モーダルの前面表示と閉じる操作 | PASS |
| モーダル表示中の Escape が全画面を解除しない | PASS |
| 全画面切替前後のノード件数保持 | PASS |
| 422 エラー・201 成功のモーダルとトーストの前面表示・閉じる操作 | PASS（API 応答はテストデータ） |
| 全画面切替で Bootstrap 再取得なし | PASS（初回 1 回のみ） |

画面キャプチャ: `/tmp/task-flow-fullscreen-780.png`、`/tmp/task-flow-fullscreen-1280.png`。

## 未検証

- 認証済みタスクフロー画面での E2E は UNVERIFIED（利用可能なログイン情報なし）。
- 実 API による一括登録・権限不足・DB 保存と再読み込み、実ブラウザでのノード D&D・エッジ接続・Undo/Redo の一連の確認は UNVERIFIED。上記の限定検証と単体テストから実施済みとは判断しない。
