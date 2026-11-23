# データモデル — ノードのチケット属性を一括変更

## 一括編集入力

| フィールド | 型・制約 |
| --- | --- |
| `BulkNodeEditRequest.nodeIds` | フローに属するタスクまたはグループの ID。選択は重複なし。適用は 2〜100 件。子への展開は行わない。最新ノードから全件解決し、消失・曖昧な ID は拒否する |
| `BulkNodeEditRequest.changes` | 以下 4 属性の部分指定。キー省略は変更しない。適用には 1 項目以上の指定と、全対象を通じて 1 件以上の値の差分が必要 |
| `BulkNodeEditChanges.trackerId` | Bootstrap の `trackers` にある数値 ID。変更されるノードの現在のステータスは変更先の `allowed_status_ids` に含まれる |
| `BulkNodeEditChanges.priorityId` | Bootstrap の `priorities` にある数値 ID |
| `BulkNodeEditChanges.assignedToId` | Bootstrap の `assignable_users` にある数値 ID、または未割当を表す `null`。全対象の適用後トラッカーで `assigned_to_id` が有効な場合に指定可能 |
| `BulkNodeEditChanges.fixedVersionId` | Bootstrap の `versions` にある数値 ID、または「なし」を表す `null`。全対象の適用後トラッカーで `fixed_version_id` が有効な場合に指定可能 |

適用後トラッカーは指定されたトラッカー、または各ノードの現トラッカー。既存データに残る数値文字列は ID の照合・差分判定で数値 ID と同じものとして扱う。選択件数はフローの全ノード数と独立に数える。

## 判定と既存の保存データ

| 対象 | 関係と制約 |
| --- | --- |
| `BulkNodeEditResult` | 適用可能なら変更後のノード一覧と実際に値が変わる ID を返す。適用不可なら理由と特定できる対象 ID・属性を返す。ストアは編集ロックやストレージ失敗も失敗結果として返す |
| `TaskFlowNode.data` | 変更した 4 属性だけを更新。ステータス、カスタムフィールド、指定外属性、選択外データを保持。位置と親子関係はノードの既存値を使い、エッジは同じものを保持する |
| `FlowSnapshot` | 適用直前の nodes / edges / baseDate を履歴に 1 件追加し、既存上限を守る。成功時に redo の履歴を空にする |
| `SerializedFlowData` | 既存 `schema_version: 1`。プロジェクトと利用者に対応する自動下書きへ変更済み nodes、元の edges と baseDate を 1 回保存。復元時は既存サニタイズを経由する |

## 画面の状態遷移

閉じる状態から開くと対象・指定は空。入力と最新データで適用可否が変わる。適用の失敗時はダイアログ内で入力を保持して修正できる。取消・Esc は一時入力を破棄して閉じる。保存成功後はノードと履歴を確定し、ダイアログを閉じる。送信中・送信済み、または Bootstrap 未取得の間は適用不可。
