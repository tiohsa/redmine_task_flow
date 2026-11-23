# 既存の Bootstrap・一括登録との連携

| 入口・結果 | 一括変更との契約 |
| --- | --- |
| `GET /projects/:project_id/task_flow/bootstrap.json` | 対象プロジェクトと利用者のメタデータを既存形式で参照する。属性適用はブラウザー内で完結する |
| `POST /projects/:project_id/task_flow/bulk_create.json` | 既存の登録操作で確定済み nodes と edges を送る。チケット属性は既存項目 `tracker_id`、`priority_id`、`assigned_to_id`、`fixed_version_id` へ写す。未入力の必須属性は登録前検証で扱う |
| `201` | 起票成功。既存処理が作成結果を表示し、送信済みに遷移する |
| `403` | 権限不足を表示する。既存の JSON エラー文言を優先し、本文がない応答にも対応する。起票は 0 件。編集と下書きを保持し、送信済みに遷移しない。既存のログインリダイレクトの処理を維持する |
| `422` | サーバー側の既存エラー詳細を表示する。同じノードに複数の詳細があれば応答順に表示する。チケット・関連とも 0 件。フローを保持して修正後の再登録を許可する |

認証は Rails のセッションと CSRF トークンを使い、起票時の 3 権限の検証と `Issue#safe_attributes=` を経由する。起票件数上限は引き続きフロー全体で判定する。

親チケットの優先度を子チケットから算出する設定では、起票後の値に Redmine の集計ルールが適用される。[Redmine の親チケット優先度](https://github.com/redmine/redmine/blob/7.0.2/app/models/issue.rb#L1371-L1373)

[認証・Bootstrap 仕様](../../01-auth-and-bootstrap.md) · [起票仕様](../../05-persistence-and-bulk-create.md)
