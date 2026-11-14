# SPEC: ツールバー機能のアイコン化

参照デザイン: `docs/code_artifact.html`  
対象実装: `frontend/src/components/ActionBars.tsx`

## 1. Goal

- `ActionBars.tsx` の上部フローティングツールバー（左上グループ・右上グループ）のテキストボタンを、`docs/code_artifact.html` に準拠したコンパクトな SVG アイコンボタン（`w-10 h-10 rounded-xl` ベース）へ置き換える。
- 画面上端配置でも見切れない下向きツールチップ（`top-full mt-2`）と、`aria-label` / `aria-pressed` によるアクセシビリティを備え、既存のストア操作・無効化境界条件・一括登録状態表示・全画面切替をすべて維持する。

## 2. Non-goals / Out-of-scope

- Zustand ストア（`useFlowStore.ts`）のアクション・状態遷移ロジックの変更。
- バックエンド API・Redmine 権限・ルーティング・DB スキーマの変更。
- `docs/code_artifact.html` 内のコピー用デモスクリプト（`copySvg` 等）の製品コードへの移植。

## 3. UI / レイアウト仕様

### 3.1 左上グループ（編集・レイアウト・履歴）

コンテナ: `bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-2xl p-1.5` 相当のフローティングバー。

| 順序 | 機能 | スタイル（`docs/code_artifact.html` 準拠） | 呼び出しアクション | 無効化条件 |
|---|---|---|---|---|
| 1 | タスク追加 | `bg-[#0077b6] hover:bg-[#006296] text-white`（カード＋プラス SVG） | `addTaskNode()` | `isSubmitted` |
| 2 | 親グループ枠 | `bg-indigo-50/80 hover:bg-indigo-100 text-indigo-600 border border-indigo-200`（破線枠＋プラス SVG） | `addGroupNode()` | `isSubmitted` |
| - | 区切り線 | `w-px h-6 bg-slate-200 mx-0.5` | - | - |
| 3 | 左→右 自動整列 | `bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80`（分岐フロー図 SVG） | `applyAutoLayout()` | `isSubmitted` |
| 4 | 日程自動伝播 | `bg-white hover:bg-amber-50 text-amber-500 border border-slate-200/80`（カレンダー＋右矢印 SVG） | `recalculateDates()` | `isSubmitted` |
| - | 区切り線 | `w-px h-6 bg-slate-200 mx-0.5` | - | - |
| 5 | Undo | `bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80`（左向き U ターン矢印 SVG） | `undo()` | `isSubmitted \|\| past.length === 0` |
| 6 | Redo | `bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80`（右向き U ターン矢印 SVG） | `redo()` | `isSubmitted \|\| future.length === 0` |

### 3.2 右上グループ（基準日・入出力・一括登録・全画面）

| 順序 | 機能 | スタイル・構成 | 呼び出しアクション | 無効化 / 表示条件 |
|---|---|---|---|---|
| 1 | フロー基準日 | カレンダー SVG（`text-slate-500`）＋ `<input type="date">`（`aria-label="フロー基準日"`） | `setBaseDate(e.target.value)` | `isSubmitted` 時は入力無効化 |
| - | 区切り線 | `w-px h-6 bg-slate-200 mx-0.5` | - | - |
| 2 | JSON出力 | `bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80`（上向きエクスポート SVG） | `onOpenJsonExport(exportJson())` | 常時操作可 |
| 3 | JSON読込 | `bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80`（下向きインポート SVG＋隠し `<input type="file" accept=".json,application/json">`） | `fileInputRef.current?.click()` → `importJson(...)` | 常時操作可 |
| 4 | サンプル初期化 | `bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80`（反時計回りリセット矢印 SVG） | `resetToSample()` | 常時操作可 |
| 5 | 新規フローとしてリセット | `h-10 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl`（テキストボタン） | `resetFlow()` | **`isSubmitted === true` のときのみ表示** |
| 6 | Redmineに一括登録 | `bg-[#00965e] hover:bg-[#007f4f] text-white`（クラウド＋チェック SVG）＋右上件数バッジ（`data-testid="bulk-create-count-badge"`, `nodes.length`） | `submitBulkCreate()` | `isSubmitting \|\| isSubmitted \|\| nodes.length === 0` |
| - | 区切り線 | `w-px h-6 bg-slate-200 mx-0.5`（`onToggleFullscreen` 指定時） | - | - |
| 7 | 全画面 / 全画面解除 | `bg-white hover:bg-slate-100 text-slate-600`（通常時） / `bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200`（全画面時） | `onToggleFullscreen()` | `onToggleFullscreen` があるとき表示。`isSubmitted` 時も常時操作可 |

## 4. ツールチップ仕様（下向き展開）

- 元の `docs/code_artifact.html` では `bottom-full mb-2`（上向き表示）だが、実際のキャンバスではツールバーが上端（`top-3`）に配置されているため、上向きでは画面上端でクリップされる。
- そのため、`TooltipWrapper`（`role="tooltip"`）により全アイコンボタンおよびフロー基準日ラッパーのカスタムツールチップを **下向き（`top-full mt-2`, `z-30`）** に展開する。
- 吹き出しの矢印（三角）はツールチップ上端（`bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-800`）に配置する。
- ホバー（`group-hover:opacity-100`）およびキーボードフォーカス（`group-focus-within:opacity-100`）で表示され、`pointer-events-none` によりキャンバスや隣接ボタンのクリックを阻害しない。

## 5. アクセシビリティ（`aria-label` / `aria-pressed`）

- すべてのアイコンボタンおよび `<input type="date">` に明示的な `aria-label` を付与する（SVG には `aria-hidden="true"` を付与）。
  - 左上: `タスク追加`, `親グループ枠`, `左→右 自動整列`, `日程自動伝播`, `Undo`（ツールチップ: `元に戻す (Undo)`）, `Redo`（ツールチップ: `やり直す (Redo)`）
  - 右上: `フロー基準日`, `JSON出力`, `JSON読込`, `サンプル初期化`, `Redmineに一括登録 (${nodes.length}件)`（送信中: `登録中...`, 完了後: `登録完了`）, `全画面表示` / `全画面解除`
- 全画面トグルボタンには `aria-pressed={isFullscreen}` を設定し、状態に応じて `aria-label`（`全画面表示` ⇔ `全画面解除`）とツールチップ（`全画面表示` ⇔ `全画面解除 (Esc)`）を切り替える。
- 一括登録ボタンは状態に応じて `aria-label` とツールチップを共通の `bulkCreateLabel`（通常時: `Redmineに一括登録 (${nodes.length}件)`、送信中: `登録中...`、送信完了後: `登録完了`）で切り替える。

## 6. 状態表現・境界条件

- **件数バッジ**: 一括登録ボタン右上に `nodes.length` を表示する（送信中・送信完了時の表示およびスピナー／完了アイコン切替を含む）。
- **無効化境界条件**:
  - `isSubmitted === true`: 編集系ボタン（タスク追加、親グループ枠、左→右 自動整列、日程自動伝播、Undo、Redo、一括登録）およびフロー基準日入力を `disabled`。JSON 出力・JSON 読込・サンプル初期化・全画面トグルは操作可。「新規フローとしてリセット」ボタンを表示。
  - `past.length === 0`: Undo を `disabled`。
  - `future.length === 0`: Redo を `disabled`。
  - `nodes.length === 0`: 一括登録を `disabled`。
  - `isSubmitting === true`: 一括登録を `disabled` とし、スピナー＋「登録中...」状態を表現。
- **CSS スコープ**: `.task-flow-root` スコープおよび `tsconfig.json` の `strict: true` を維持する。

## 7. Required Tests

- **Unit (`frontend/tests/`)**:
  - `fullscreenToggle.test.tsx`: テキスト文字列ではなく `aria-label` / `aria-pressed`（アクセシブルネーム）で全画面切替・解除・状態保持・`Esc` 抑止を検証。
  - `actionBars.test.tsx`: 全ボタンの存在と `aria-label`、件数バッジ、`disabled` 境界条件（`isSubmitted`, `past.length === 0`, `future.length === 0`, `nodes.length === 0`, `isSubmitting`）、`isSubmitting` / `isSubmitted` / リセットボタン表示切替、各クリックハンドラおよびファイル読込・JSON 出力呼び出しを検証。
- **Build (`frontend/`)**:
  - `npm test`（Vitest 全件パス）および `npm run build`（`tsc -b && vite build` 成功、`assets/javascripts/task_flow.js` と `assets/stylesheets/task_flow.css` 更新）。
- **E2E（Docker 上の Redmine `http://localhost:3000`）**:
  - アイコン表示・色・区切り線、ホバー／フォーカス時の下向きツールチップ（上端で切れないこと）、各ボタン操作、一括登録（バッジ・送信中・完了・新規フローリセット）、全画面切替を確認する。
