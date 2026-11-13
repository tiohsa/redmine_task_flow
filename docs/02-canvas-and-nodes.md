# フローキャンバス・ノード・親子グループ仕様

対象実装: `frontend/src/components/FlowCanvas.tsx`, `frontend/src/components/ActionBars.tsx`, `frontend/src/components/nodes/TaskNode.tsx`, `frontend/src/components/nodes/GroupNode.tsx`, `frontend/src/store/useFlowStore.ts`, `frontend/src/domain/uuid.ts`, `frontend/src/index.css`

## 1. フローキャンバス設定 (`FlowCanvas.tsx`)

- `@xyflow/react` の `<ReactFlow>` を制御コンポーネントとして使用する。
- **グリッド・スナップ**:
  - 背景ドット: `<Background gap={20} size={1.25} color="#cbd5e1" />`
  - スナップ: `snapToGrid` 有効、`snapGrid={[10, 10]}`
- **ズーム制御**:
  - ズーム範囲: `minZoom={0.4}`、`maxZoom={1.8}`、初期表示時に `fitView` を適用する。
  - 左下ズームバー: `−` (`zoomOut`)、`{zoomPercent}%` (`zoomTo(1)` で 100% リセット)、`+` (`zoomIn`)、`Fit` (`fitView({ padding: 0.2 })`)。`onMoveEnd` で `zoomPercent` を同期する。
- **選択モデル・削除制御**:
  - `multiSelectionKeyCode={null}` により単一選択（`selectedNodeId` または `selectedEdgeId` の排他選択）とする。
  - `deleteKeyCode={null}` により React Flow 標準の削除キー処理を無効化し、独自のキーボードハンドラで `deleteSelected()` を実行する。
- **CSS スコープ (`index.css`, `tailwind.config.js`)**:
  - Tailwind CSS は `important: '.task-flow-root'`、かつ `corePlugins.preflight: false` で設定し、Redmine 標準スタイルとの競合を防止する。

## 2. ツールバー操作 (`ActionBars.tsx`)

### 左上フローティングバー

| ボタン | 呼び出しアクション | 無効化条件 |
|---|---|---|
| `タスク追加` | `addTaskNode()` | `isSubmitted` |
| `親グループ枠` | `addGroupNode()` | `isSubmitted` |
| `左→右 自動整列` | `applyAutoLayout()` | `isSubmitted` |
| `日程自動伝播` | `recalculateDates()` | `isSubmitted` |
| `Undo` | `undo()` | `isSubmitted \|\| past.length === 0` |
| `Redo` | `redo()` | `isSubmitted \|\| future.length === 0` |

### 右上フローティングバー

| 要素 / ボタン | 呼び出しアクション | 備考 |
|---|---|---|
| `フロー基準日` (`<input type="date">`) | `setBaseDate(e.target.value)` | `isSubmitted` 時は無効化 |
| `JSON出力` | `onOpenJsonExport(exportJson())` | 常時操作可 |
| `JSON読込` | `importJson(reader.result)` | `.json,application/json` ファイル選択 |
| `サンプル初期化` | `resetToSample()` | 確認なしでサンプルフローへ再初期化 |
| `新規フローとしてリセット` | `resetFlow()` | `isSubmitted === true` のときのみ表示 |
| `Redmineに一括登録（N件）` | `submitBulkCreate()` | `isSubmitting \|\| isSubmitted \|\| nodes.length === 0` 時は無効化。送信中は `登録中...`、完了後は `登録完了` を表示 |

## 3. キーボードショートカット (`FlowCanvas.tsx`)

`window` の `keydown` イベントで処理する。`input` / `textarea` / `select` / `isContentEditable` 要素にフォーカス中（`isEditableElement(e.target)`）は、ブラウザ標準の入力・編集を優先してすべてのショートカットをスキップする。

| キー | 条件 | 動作 |
|---|---|---|
| `Ctrl+Z` / `Cmd+Z` | 入力要素外 | `undo()` |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | 入力要素外 | `redo()` |
| `Tab` | `!isSubmitted` かつ `taskNode` 選択中 | `addTaskNode({ sourceNodeId: selected.id })`（右隣に後続タスクを追加しエッジ接続） |
| `Enter` | `!isSubmitted` かつ `taskNode` 選択中 | `addTaskNode({ siblingOfNodeId: selected.id })`（下に並列タスクを追加し全先行エッジを複製） |
| `Delete` / `Backspace` | `!isSubmitted` かつノードまたはエッジ選択中 | `deleteSelected()` |

## 4. Undo / Redo 履歴仕様 (`useFlowStore.ts`, `FlowCanvas.tsx`)

- **スナップショット構造**: `FlowSnapshot = { nodes, edges, baseDate }`
- **保持上限**: `MAX_HISTORY = 50`（`past` は末尾 50 件、`future` は先頭 50 件まで保持）。新規操作 (`pushSnapshot`) 時は `future` を空にクリアする。
- **ドラッグ操作の履歴集約**:
  - `onNodesChange` によるドラッグ途中の座標更新では履歴を積まない。
  - `onNodeDragStart` でドラッグ前スナップショットを `preDragSnapshotRef` に退避し、`onNodeDragStop` で親グループ変更または実座標変化（`beforeNode.position.x !== draggedNode.position.x || beforeNode.position.y !== draggedNode.position.y`）があった場合のみ `pushSnapshot(preSnap)` を実行する。
- **テキスト入力の履歴集約**: `InspectorPanel` の題名・説明・テキスト系カスタムフィールドでは、`onFocus` でスナップショットを取得し、`onChange` を `{ recordHistory: false }` で反映、`onBlur` で `pushSnapshot` を実行する。

## 5. 送信後ロックとフロー初期化・リセット (`useFlowStore.ts`)

- **送信後ロック (`isSubmitted === true`)**:
  - `<ReactFlow>` の `nodesDraggable={!isSubmitted}`、`nodesConnectable={!isSubmitted}` が `false` になる。
  - `addTaskNode`, `addGroupNode`, `deleteSelected`, `detachFromGroup`, `assignNodeToGroup`, `connectNodes`, `updateNodeData`, `updateEdgeDelay`, `setBaseDate`, `recalculateDates`, `applyAutoLayout`, `undo`, `redo` はすべて変更を行わずに終了（または警告トースト表示）する。
- **新規フローとしてリセット (`resetFlow`)**:
  - `localStorage` の下書きを削除し、`baseDate` を `todayYmd()` に戻し、初期タスクノード 1 件（題名「新規タスク」、座標 `{ x: 120, y: 140 }`）のみの未送信状態へリセットする。
- **サンプル初期化 (`resetToSample`)**:
  - `localStorage` の下書きを削除し、`createSampleFlow`（親グループ 1 件「機能実装フェーズ」＋タスク 4 件「要件定義・設計」「バックエンドAPI実装」「フロントエンドUI実装」「結合テスト・QA」＋エッジ 4 本）を生成して下書き保存する。

## 6. ノード仕様

### 6.1 ID 生成 (`uuid.ts`)

- `generateId(prefix = 'node')`: `crypto.randomUUID()` が利用可能な場合は `${prefix}_${crypto.randomUUID().slice(0, 8)}`、非 HTTPS 環境など利用不可時は時刻・乱数ベースのフォールバック文字列を生成する。
- タスクノードは `task_`、グループノードは `group_`、エッジは `edge_`、トーストは `toast_` をプレフィックスに使用する。

### 6.2 タスクノード (`TaskNode.tsx`)

- **寸法**: 幅 `256px` (`TASK_NODE_WIDTH`) × 高さ `112px` (`TASK_NODE_HEIGHT`) 固定。
- **ハンドル**: 左端中央 `Position.Left` (`type="target"`)、右端中央 `Position.Right` (`type="source"`)。
- **表示要素**:
  - ヘッダ: トラッカーバッジ（`TRACKER_STYLES` 5色循環）、子タスク時のみ `子` バッジ、バリデーションエラー時 `!` アイコン、チケット番号（登録後は `/issues/${createdIssueId}` への別タブリンク、未登録時は `#NEW`）。
  - ボディ: 題名（最大2行クランプ。空文字時は `（ダブルクリックで題名入力）`）。
  - フッタ: 担当者アバター（氏名の先頭2文字、`AVATAR_STYLES` 5色循環、未割当時は `未`）＋担当者名、予定工数（`{estimatedHours ?? 0}h`）、日程（`M/D-M/D`、手動日程固定 `lockDates: true` 時は `🔒` 付与）。
- **操作**:
  - ホバー時に右端外側に `+` ボタンを表示し、クリックで `addTaskNode({ sourceNodeId: id })` を実行。
  - ダブルクリックで `selectNode(id)` および `triggerFocusSubject()` を実行し、インスペクタ展開＋題名フォーカスを行う。

### 6.3 タスク追加時の位置と属性継承 (`addTaskNode`)

- **後続追加 (`sourceNodeId` 指定 / `Tab` / `+` ボタン)**:
  - 配置: 元ノードの絶対座標を基準に `{ x: abs.x + TASK_NODE_WIDTH + 90, y: abs.y }`。
  - 題名: `後続タスク`
  - 継承属性: 元ノードの `trackerId`, `priorityId`, `assignedToId`, `fixedVersionId`, `customFieldValues` をコピー。`statusId` はトラッカーの `default_status_id`（フォールバックは元ノードの `statusId`）。
  - エッジ: 元ノード → 新ノードの `dependencyEdge` (`delay: 0`) を自動追加。
- **並列追加 (`siblingOfNodeId` 指定 / `Enter`)**:
  - 配置: 元ノードの絶対座標を基準に `{ x: abs.x, y: abs.y + TASK_NODE_HEIGHT + 40 }`。
  - 題名: `並列タスク`
  - 継承属性: 後続追加と同様にトラッカー・優先度・担当者・バージョン・カスタムフィールドを継承。
  - エッジ: 元ノードへ流入しているすべてのエッジの `source` から新ノードへ向かう `dependencyEdge` (`delay: 0`) を自動追加。
- **ツールバーからの新規追加（オプション未指定）**:
  - 配置: `taskCount % 4` に応じて `{ x: 120 + (taskCount % 4) * 40, y: 120 + (taskCount % 4) * 40 }`。
  - 題名: `新規タスク`、デフォルト属性 (`getDefaultNodeData`) を使用（`estimatedHours: 8`, `lockDates: false`）。

### 6.4 グループノード (`GroupNode.tsx`)

- **初期寸法**: 幅 `420px` (`DEFAULT_GROUP_WIDTH`) × 高さ `260px` (`DEFAULT_GROUP_HEIGHT`)。
- **リサイズ**: `<NodeResizer>` を備え、`selected && !isSubmitted` 時のみリサイズ枠・ハンドルを表示する。最小サイズは `minWidth={280}`, `minHeight={180}`。
- **表示要素**:
  - `親チケット` バッジ、題名（空時は `（題名未入力）`）。
  - 子タスク件数（`子: {childrenCount}件`）、合計予定工数（`計 {totalHours}h`）、集計期間（`startDate` または `dueDate` がある場合 `M/D-M/D`）、チケット番号（`#id` リンクまたは `#NEW`）。
- **追加時の初期データ**: 題名 `親チケットグループ`、`estimatedHours: null`, `startDate: null`, `dueDate: null`。位置未指定時は `{ x: 100 + groupCount * 40, y: 80 + groupCount * 40 }`。

## 7. 親子グループ付け替えと配列順不変条件

- **配列順不変条件 (`normalizeNodesOrder`)**:
  - React Flow のサブフロー（`parentId` によるネスト描画）要件に合わせ、`nodes` 配列内では**常にすべての `groupNode` が `taskNode` より前に配置される**よう正規化する。
- **ドラッグによる親子付け替え (`handleNodeDragStop`)**:
  - `taskNode` をドラッグしてドロップした際、ノードの中心座標 `(absX + TASK_NODE_WIDTH / 2, absY + TASK_NODE_HEIGHT / 2)` を算出する。
  - その中心座標が枠領域内（`x <= centerX <= x + w` かつ `y <= centerY <= y + h`）に含まれる `groupNode` を探索する。
  - 現在の `parentId` と異なるグループ（または枠外 `null`）に入った場合、`assignNodeToGroup(draggedNode.id, nextParentId)` を実行する。
  - グループ内へ移動する場合は親座標基準の相対座標へ、枠外へ移動する場合は絶対座標へ `position` を変換し、`propagateDates` で親グループの集計値を再計算する。
- **インスペクタからの解除 (`detachFromGroup`)**:
  - 子タスク選択時に表示される「枠から外す」ボタンで `parentId` を `undefined` にし、絶対座標へ変換して `propagateDates` を再実行する。
- **グループノード削除時の子タスク保護 (`deleteSelected`)**:
  - `groupNode` を削除しても配下の子 `taskNode` は削除しない。すべての子の `parentId` を `undefined` にして絶対座標へ変換したうえで `propagateDates` を再実行する。
