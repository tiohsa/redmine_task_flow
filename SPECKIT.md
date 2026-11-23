# GitHub Spec Kit 開発運用ガイド（`redmine_task_flow` 向け）

このドキュメントは、`plugins/redmine_task_flow/` における既存の `AGENTS.md` の規約を維持しながら、**GitHub Spec Kit** を用いて仕様駆動開発（SDD）・バグ修正・アイデア検証を進めるための手順書です。

---

## 1. `AGENTS.md` と Spec Kit の役割分担

両者は競合するものではなく、**「常駐ルール（地図）」**と**「作業進行エンジン（手順）」**として組み合わせて使用します。

| 対象 | 役割 | 参照・実行タイミング |
| :--- | :--- | :--- |
| **`AGENTS.md`** | リポジトリ構成、アーキテクチャ境界、コード規約、セキュリティ、テスト・E2E要件などの**不変の前提ルール** | エージェント起動時・作業時に毎回自動参照 |
| **Spec Kit** (`.specify/`, `.agents/`) | 機能開発・バグ修正・アイデア検証を進めるための**ステップバイステップの進行テンプレート** | `/speckit-*` コマンドをチャットで実行したとき |

---

## 2. セットアップ（プロジェクト初回のみ）

### 2.1 CLI のインストールと初期化（ターミナルで実行）

```bash
# Spec Kit CLI のインストール
uv tool install specify-cli

# プロジェクトディレクトリで初期化（利用するエージェントに合わせて --integration を指定）
specify init --here --integration copilot

# 必要に応じて拡張機能を追加
specify extension add bug     # バグ修正フロー用
specify extension add assess  # アイデア検証フロー用
```

### 2.2 開発原則（Constitution）の登録（エージェントのチャットで実行）

既存の `AGENTS.md` のルールを Spec Kit のプロジェクト原則（`.specify/memory/constitution.md`）へ引き継ぎます。

```text
/speckit-constitution plugins/redmine_task_flow/AGENTS.md を読み込み、そのアーキテクチャ境界（UI/Controller -> 公開入口 -> domain）、セキュリティ要件、テスト品質ルール（Minitest/Vitest、verify-cli.mjs、start-e2e.sh による実ブラウザ検証）、および docs/ 配下を仕様の正本（Source of Truth）として常に最新に保つ運用ルールをプロジェクト原則として定義してください。回答や生成ドキュメントはすべて日本語にしてください。
```

---

## 3. プロセス別の使い方（エージェントのチャットで実行）

※コマンドはターミナルではなく、**AIコーディングエージェントのチャット欄**で1つずつ実行し、出力されたドキュメントを確認してから次のステップへ進みます（エージェントの種類により `/speckit-` または `/speckit.` の接頭辞を使用します）。

### A. 新機能開発（Spec-Driven Development）

1. **要件定義（`/speckit-specify`）**
   ```text
   /speckit-specify キャンバス上の複数ノードを選択して一括でトラッカーや担当者を設定できるプロパティ一括編集パネルを追加する。受け入れ条件、正常系、境界値（0件・上限件数・権限不足時）、失敗時の振る舞いを日本語で定義してください。
   ```
   *(※仕様の曖昧さを詰めたい場合は `/speckit-clarify` を実行します)*

2. **技術設計（`/speckit-plan`）**
   ```text
   /speckit-plan AGENTS.md の境界ルールに従い、frontend/src/features/<feature>/index.ts と internal/domain/ に分離した React + Zustand + TypeScript 設計にしてください。既存コードへの影響範囲と検証方針（Vitest および start-e2e.sh でのブラウザ確認）も含めてください。
   ```

3. **タスク分解（`/speckit-tasks`）**
   ```text
   /speckit-tasks
   ```

4. **実装と収束（`/speckit-implement` → `/speckit-converge`）**
   ```text
   /speckit-implement
   ```
   ```text
   /speckit-converge
   ```
   * `Converged` と判定されるまで `implement` と `converge` を繰り返します。
   * **仕上げの指示**：完了時に以下を指示し、既存の `AGENTS.md` 運用と同期させます。
     ```text
     今回の変更内容を docs/ 配下の該当仕様書（正本）および verification/feature-map.json に反映し、node verification/verify-cli.mjs と実ブラウザ検証（start-e2e.sh）の結果を報告してください。
     ```

---

### B. バグ修正（Bug fixing 拡張）

1. **原因調査（`/speckit-bug-assess`）**
   ```text
   /speckit-bug-assess "循環依存を含むノード構成で一括起票を実行した際、ロールバック後に画面上のエラーメッセージが消えない" slug=cycle-error-reset
   ```
2. **修正の実装（`/speckit-bug-fix`）**
   ```text
   /speckit-bug-fix slug=cycle-error-reset
   ```
3. **検証・回帰テスト（`/speckit-bug-test`）**
   ```text
   /speckit-bug-test slug=cycle-error-reset
   ```
   * `.specify/bugs/<slug>/` に調査・検証レポートが生成され、最終判定が `verified` になれば完了です。

---

### C. アイデアの実装可否判断（Idea assessment 拡張）

コードを書く前に「作るべきか・技術的に成立するか」を調査・判断したい場合に使用します。

```text
/speckit-assess-intake "既存のチケット一覧から逆算してDAGタスクフロー図を自動生成する機能" slug=reverse-dag
/speckit-assess-research slug=reverse-dag
/speckit-assess-define slug=reverse-dag
/speckit-assess-shape slug=reverse-dag
/speckit-assess-decide slug=reverse-dag
```
* `.specify/assessments/<slug>/decision.md` に `go` / `needs-clarification` / `kill` の判断が出力されます。
* `go` の場合は、`decision.md` の引き継ぎサマリーを `/speckit-specify` に渡して開発へ進みます。

---

## 4. Git 管理・コミット方針

| ディレクトリ | Git コミット方針 | 理由・補足 |
| :--- | :--- | :--- |
| **`.specify/`** | **原則コミットする** | プロジェクト原則（`memory/constitution.md`）や設計・判断の記録（`bugs/`, `assessments/` 等）をチームで共有するため。<br>※`docs/` と仕様が二重管理になるのを避けたい場合は、完了後の作業ディレクトリ（`.specify/specs/` 等）のみ削除または `.gitignore` 対象にする運用も可。 |
| **`.agents/`** | **チーム統一ならコミット**<br>（個人利用なら除外可） | チーム全員が同じエージェント（Copilot 等）を使う場合はコミットすると再初期化が不要。メンバーごとに異なるエージェントを使う場合は `.gitignore` に追加して各自で `specify init` する。 |

### 除外する場合の `.gitignore` 例

```gitignore
# メンバーごとに異なる AI エージェント統合ファイルを使う場合のみ除外
.agents/

# 仕様の正本を docs/ に一本化し、Spec Kit の一時作業フォルダを残さない場合
# .specify/specs/
```