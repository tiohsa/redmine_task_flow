# インスペクタパネル・フィールド制御・クライアント検証仕様

対象実装: `frontend/src/components/InspectorPanel.tsx`, `frontend/src/domain/nodeValidation.ts`, `frontend/src/store/useFlowStore.ts`, `frontend/src/components/nodes/TaskNode.tsx`, `frontend/src/components/nodes/GroupNode.tsx`

## 1. インスペクタパネルの基本構成・折りたたみ (`InspectorPanel.tsx`)

右側に配置される `<aside aria-label="インスペクタパネル">` で、選択中のノードまたはエッジの属性を編集する。

### 折りたたみ状態 (`isInspectorCollapsed`)

- **展開時（デフォルト `false`）**: 幅 `w-80 sm:w-96`。ヘッダに閉じるボタン（`aria-expanded="true"`, `aria-label="インスペクタパネルを折りたたむ"`）を表示。
- **折りたたみ時（`true`）**: 幅 `w-10` のスリムバー。展開ボタン（`aria-expanded="false"`, `aria-label="インスペクタパネルを展開"`）のみを表示。
- トグルボタンのクリック時は `e.stopPropagation()` を呼び出し、親コンテナへのイベント伝播を抑止する。
- **状態維持と自動展開ルール**:
  - `selectNode` / `selectEdge` による単純クリック選択では `isInspectorCollapsed` を変更しない（折りたたまれたまま維持）。
  - `addTaskNode`, `addGroupNode`, `triggerFocusSubject`（ノードのダブルクリック等）を実行した場合は、`focusSubjectSeq` をインクリメントするとともに `isInspectorCollapsed: false` として自動展開する。
  - `InspectorPanel` は `focusSubjectSeq` の変化を監視し、`focusSubjectSeq > 0 && selectedNode` の場合に `#field-subject` へ `focus()` および `select()` を行う。
- **送信後・エラー時の操作性**: `isSubmitted === true` や `validationErrors` 存在時でも折りたたみ/展開トグルは常に有効であり、トグルしても入力値・エラー表示・Undo/Redo 履歴は失われない。

### ヘッダ・未選択状態

- **サブタイトル / タイトル**:
  - エッジ選択時: `Dependency Edge` / `依存関係（先行・後続）の設定`
  - グループノード選択時: `Parent Issue Group` / `親チケット枠の属性編集`
  - タスクノード選択時: `Task Issue Node` / `チケット属性編集`
  - 未選択時: `Inspector` / `チケット属性編集`（本体に「ノードまたは矢印を選択してください」の案内を表示）
- **削除ボタン**: `(selectedNode || selectedEdge) && !isSubmitted` のときヘッダに「削除」ボタンを表示し、クリックで `deleteSelected()` を実行する。

## 2. エッジ選択時の編集 UI

- 先行タスク (`Source`) と後続タスク (`Target`) の題名（未設定時は ID）を表示する。
- **待機日数 / ラグ (`IssueRelation#delay`)**:
  - `<input id="edge-delay-input" type="number" min={0} max={60}>`
  - `isSubmitted` 時は `disabled`。変更時は `updateEdgeDelay(selectedEdge.id, Number(e.target.value))` を呼び出し、0〜60 の整数へクランプして日程を再計算する。

## 3. ノード選択時の編集 UI

### 3.1 親グループ表示

- `!isGroup && selectedNode.parentId` の場合、インスペクタ上部に親チケット名を表示する。
- `!isSubmitted` の場合は「枠から外す」ボタンを表示し、クリックで `detachFromGroup(selectedNode.id)` を実行する。

### 3.2 標準フィールド一覧

| フィールド | ID | 制御・特殊仕様 |
|---|---|---|
| 題名 (Subject) | `#field-subject` | 必須。`onFocus` で履歴スナップショット取得、`onChange` は `recordHistory: false`、`onBlur` で履歴確定 |
| トラッカー | `#field-tracker` | 必須。`bootstrap.trackers` を表示。変更時、現在の `statusId` が新トラッカーの `allowed_status_ids` に含まれない場合は `tracker.default_status_id` へ自動補正 |
| ステータス | `#field-status` | 選択中トラッカーの `allowed_status_ids` に含まれるステータスのみ表示（空時は全ステータス） |
| 優先度 | `#field-priority` | `bootstrap.priorities` を表示 |
| 担当者 | `#field-assignee` | `（未割当）` + `bootstrap.assignable_users`。`disabled_core_fields` による無効化対象 |
| 対象バージョン | `#field-version` | `（なし）` + `bootstrap.versions`。`disabled_core_fields` による無効化対象 |
| 予定工数 (h) | `#field-estimated-hours` | `type="number" min={0} step="0.5"`。グループノード時は `disabled`（placeholder: `自動集計`）。`disabled_core_fields` 対象 |
| 手動日程で固定 | チェックボックス | タスクノード時のみ表示 (`lockDates`)。`isSubmitted` 時は `disabled` |
| 開始日 | `#field-start-date` | `type="date"`。手動編集時は `lockDates: true` を自動設定。グループノード時は `disabled`。`disabled_core_fields` 対象 |
| 期日 | `#field-due-date` | `type="date"`。手動編集時は `lockDates: true` を自動設定。グループノード時は `disabled`。`disabled_core_fields` 対象 |
| 説明 (Description) | `#field-description` | `<textarea rows={3}>`。題名と同様 `onFocus`/`onBlur` で履歴管理。`disabled_core_fields` 対象 |

- グループノード選択時はスケジュール日程欄の下部に「※ 親チケットは Redmine 標準仕様により子チケットの期間・工数から自動集計されます。」の注記を表示する。

### 3.3 トラッカー別コアフィールド無効化 (`disabled_core_fields`)

選択中トラッカーの `disabled_core_fields` に含まれる項目は以下のように制御する。

- `assigned_to_id`: 担当者欄を `opacity-40 pointer-events-none` かつ `disabled`
- `fixed_version_id`: 対象バージョン欄を `opacity-40 pointer-events-none` かつ `disabled`
- `estimated_hours`: 予定工数欄を `opacity-60` かつ `disabled`
- `start_date`: 開始日入力を `disabled`
- `due_date`: 期日入力を `disabled`
- `description`: 説明欄を `opacity-40 pointer-events-none` かつ `disabled`

### 3.4 トラッカー別カスタムフィールド描画 (`renderCustomFieldInput`)

`tracker.custom_fields` が 1 件以上ある場合のみ「カスタムフィールド（トラッカー連動）」セクションを描画する。`is_required === true` の項目には `*` を表示する。

| `field_format` | 描画される入力要素 | 備考 |
|---|---|---|
| `list` | `<select>` | `（選択してください）` + `possible_values` |
| `bool` | `<select>` | `（未選択）`, `1`: `はい`, `0`: `いいえ` |
| `text` | `<textarea rows={2}>` | `onFocus`/`onBlur` による履歴集約 |
| `int` | `<input type="number" step="1">` | — |
| `float` | `<input type="number" step="0.1">` | — |
| `date` | `<input type="date">` | — |
| その他（デフォルト） | `<input type="text">` | `onFocus`/`onBlur` による履歴集約 |

## 4. クライアント側バリデーション仕様 (`nodeValidation.ts`, `useFlowStore.ts`)

### 4.1 単一ノード検証 (`validateNodeAttributes(node, bootstrap)`)

| 検証条件 | エラーメッセージ |
|---|---|
| `!node.data.subject \|\| !node.data.subject.trim()` | `題名を入力してください` |
| `node.type === 'taskNode' && startDate && dueDate && startDate > dueDate` | `開始日は期日以前の日付を指定してください` |
| `bootstrap` 存在時に `trackerId` が `bootstrap.trackers` に見つからない | `有効なトラッカーを選択してください` |
| トラッカーの `custom_fields` で `cf.is_required === true` かつ `customFieldValues[String(cf.id)]` が未設定・空文字・空白のみ | `カスタムフィールド「${cf.name}」は必須です` |

### 4.2 エラー表示と送信前ゲート

- **表示優先度**: `InspectorPanel` および `TaskNode` は、サーバー返却エラー（`validationErrors[node.id]`）が存在する場合はそれを表示し、存在しない場合は `validateNodeAttributes` の結果（ローカルエラー）を表示する。
- **エラー自動クリア**: `updateNodeData` が実行されると、対象ノードの `validationErrors[nodeId]` はクリアされる。
- **送信前ゲート (`submitBulkCreate`)**:
  - `nodes.length === 0` の場合: 警告トースト「登録するタスクノードがありません」を表示して終了。
  - 全ノードに対して `validateNodeAttributes` を実行し、1 件でもエラーがあれば `validationErrors` を更新、最初のエラーノードを選択 (`selectNode(firstErrorNodeId)`)、エラートースト「入力エラーのあるノードがあります。右側のインスペクタを確認してください」を表示して API 送信を中止する。
