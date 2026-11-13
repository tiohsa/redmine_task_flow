# 依存関係・循環防止・日付伝播・自動レイアウト仕様

対象実装: `frontend/src/components/edges/DependencyEdge.tsx`, `frontend/src/domain/graphValidation.ts`, `frontend/src/domain/datePropagation.ts`, `frontend/src/domain/autoLayout.ts`, `frontend/src/store/useFlowStore.ts`

## 1. 依存関係エッジ (`DependencyEdge.tsx`, `FlowCanvas.tsx`)

- **種別**: `dependencyEdge`（Redmine の `IssueRelation` における `relation_type: 'precedes'` 固定）。
- **描画**:
  - `<BaseEdge>` + `getBezierPath` によるベジェ曲線。終端矢印は `MarkerType.ArrowClosed` (`#64748b`)。
  - 選択状態 (`selected === true`) は線色 `#0284c7`・線幅 `3`、非選択時は線色 `#64748b`・線幅 `2`。
- **ラベル操作**:
  - `<EdgeLabelRenderer>` によりエッジ中央にピルボタンを描画する。
  - 表示文字列: `delay > 0` の場合は `precedes +{delay}d`、`delay === 0` の場合は `precedes`。
  - クリックで `selectEdge(id)` を呼び出し、右側のインスペクタパネルで `delay` を編集できる。
- **待機日数 (`delay`) 制約**:
  - 許容範囲は `0` 〜 `60` の整数（`updateEdgeDelay` 内で `Math.max(0, Math.min(60, Math.trunc(delay)))` にクランプ、非有限数は `0`）。
  - `delay = 0` は「先行タスクの期日の翌日から後続タスクを開始する」ことを意味する。

## 2. 接続バリデーション・循環依存検出 (`validateConnection`)

`FlowCanvas.tsx` の `isValidConnection` および `useFlowStore.ts` の `connectNodes` で `validateConnection(source, target, nodes, edges)` を実行する。拒否時は `{ ok: false, reason }` を返し、`connectNodes` では `warning` トーストを表示する。

| チェック項目 | 拒否条件 | エラーメッセージ (`reason`) |
|---|---|---|
| 端点存在 | `!source \|\| !target` | `接続元または接続先が指定されていません` |
| 自己ループ | `source === target` | `自己ループ（同じタスクへの接続）はできません` |
| 重複エッジ | 同一 `(source, target)` が `edges` に存在 | `すでに同じ先行・後続関係が存在します` |
| ノード存在 | `sourceNode` または `targetNode` が未検出 | `接続対象のノードが見つかりません` |
| グループ接続禁止 | `sourceNode.type === 'groupNode' \|\| targetNode.type === 'groupNode'` | `親グループ枠には依存関係（precedes）を接続できません` |
| 循環依存 (DAG) | `target` から既存エッジの有向グラフを BFS（幅優先探索）して `source` に到達可能 | `循環依存になるため接続できません` |

## 3. 日付伝播エンジン (`propagateDates` in `datePropagation.ts`)

### 3.1 位置づけと基準仕様

- フロントエンドの `propagateDates` は、**カレンダー日ベースのスケジュールプレビュー計算**である。
- Redmine の稼働日カレンダー（土日・祝日スキップ）およびサーバー側ロールアップを考慮した最終確定日程は、一括登録 (`bulk_create`) 実行後のレスポンスで各ノードへ反映される。
- 日付演算には `addCalendarDays(ymd, days)`（`Date.UTC` を使用）を用い、DST やローカルタイムゾーンによる 1 日ずれを防止する。
- `baseDate` が `YYYY-MM-DD` 形式でない場合は `todayYmd()`（ローカル時刻の当日）を `effectiveBaseDate` として使用する。

### 3.2 トポロジカルソート (`topologicalSortTaskIds`)

- `taskNode` のみを対象に入次数 0 のノードから Kahn のアルゴリズムで上流 → 下流順にソートする。
- エッジのうち両端が `taskNode` に含まれるものだけを対象とする。
- 万一未処理の `taskNode` が残った場合は末尾へフォールバック追加する。

### 3.3 タスクノードの日程計算ルール

トポロジカル順に各 `taskNode` を処理する。

1. **手動固定 (`node.data.lockDates === true`)**:
   - 当該ノードの `startDate`・`dueDate` は再計算せずそのまま保護する。
   - ただし保護された `dueDate` は後続タスクの開始日計算の入力として下流へ伝播する。
2. **自動計算 (`node.data.lockDates === false`)**:
   - **開始日 (`startDate`)**:
     - 先行エッジなし (`incoming.length === 0`): `effectiveBaseDate` を採用する。
     - 先行エッジあり: 各先行エッジについて、先行タスクの計算済み `dueDate` が存在する場合に `addCalendarDays(srcDates.dueDate, 1 + clampedDelay)`（`delay` は `0..60` の整数にクランプ）を候補日として収集し、候補日のうち**最も遅い日付**（文字列ソートの末尾）を採用する。
     - すべての先行タスクの `dueDate` が `null` である場合: 既存の `node.data.startDate` を変更せず維持する。
   - **期日 (`dueDate`)**:
     - `startDate` が存在する場合、`estimatedHours` から期間日数を算出する。
     - `estimatedHours` が `null` / `undefined` / `0` 以下の場合は **`8` 時間（1 日相当）** として扱う。
     - 期間日数: `durationDays = Math.max(1, Math.ceil(effectiveHours / 8))`
     - 期日: `dueDate = addCalendarDays(startDate, durationDays - 1)`（例: 8h = 1 日間 → `startDate` と同日、16h = 2 日間 → `startDate + 1` 日）。

### 3.4 グループノードのロールアップ

すべての `groupNode` について、配下の子 `taskNode`（`node.parentId === group.id`）の計算済み値から以下を集計する。

- **子タスクが 0 件の場合**: `startDate = null`, `dueDate = null`, `estimatedHours = null`
- **子タスクが 1 件以上の場合**:
  - `startDate`: null を除く子の `startDate` の最小値（すべて null の場合は `null`）
  - `dueDate`: null を除く子の `dueDate` の最大値（すべて null の場合は `null`）
  - `estimatedHours`: 子の `estimatedHours` の合計（`null` は `0` として加算）

### 3.5 自動再計算の発火タイミング (`useFlowStore.ts`)

`initialize`（下書き復元/サンプル生成）、`addTaskNode`、`addGroupNode`、`deleteSelected`、`detachFromGroup`、`assignNodeToGroup`、`connectNodes`、`updateNodeData`、`updateEdgeDelay`、`setBaseDate`、`recalculateDates`、`importJson` の実行時に `propagateDates` を適用する。

## 4. 自動レイアウト (`computeAutoLayout` in `autoLayout.ts`)

`dagre` を用いて全 `taskNode` を左から右（LR）へ整列し、`groupNode` の枠を子タスクに合わせて自動調整する。

- **グラフ設定**:
  - `rankdir: 'LR'`
  - `nodesep: 56`
  - `ranksep: 96`
  - `marginx: 60`
  - `marginy: 80`
- **タスクノード配置**:
  - すべての `taskNode` を幅 `TASK_NODE_WIDTH (256)`、高さ `TASK_NODE_HEIGHT (112)` として登録し、`taskNode` 間の全エッジを登録して `dagre.layout(g)` を実行する。
  - `dagre` が返す中心座標から左上座標を求め、`Math.round((coord - size / 2) / 10) * 10` により `10px` 単位へスナップする。
- **グループノード配置・サイズ更新**:
  - **子タスクを持つグループ**: 全子タスクの絶対座標バウンディングボックスに対し、余白 `padX = 28`, `padTop = 52`, `padBottom = 28` を加えた位置・サイズ（`width`, `height`, `style.width`, `style.height`）へ更新する。各子タスクの `position` はグループ左上からの相対座標へ変換する。
  - **子タスクを持たないグループ**: 既存サイズ（または `DEFAULT_GROUP_WIDTH (420)` × `DEFAULT_GROUP_HEIGHT (260)`）を維持し、全タスクの最下端 `maxBottom + 60` の位置に `x = 60` から横方向 `40px` 間隔で並べて配置する。
- **不変条件の維持**: 返却配列は `[...nextGroups, ...nextTasks]` とし、常に `groupNode` が `taskNode` より前に配置される。
