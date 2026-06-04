# RSS Feed Generator

様々なデータソースから RSS フィード (XML) を生成し、GitHub Pages などで公開するためのリポジトリです。
将来的に他のソースからのフィード生成スクリプトもこのリポジトリ内に追加・統合していくことを前提として設計されています。

生成された各フィードは、GitHub Actions によって定期的に自動更新され、GitHub Pages (`gh-pages` ブランチ) にデプロイされて公開されます。

## ディレクトリ構成と設計方針

- **独立したフィード生成スクリプト**: 各フィードの生成ロジックは、ルートディレクトリにある個別のスクリプト（例: `github-stars-release.js`）として実装します。
- **個別のビルドスクリプト**: 新しいフィードを追加する際は、`package.json` の `scripts` に `build:<feed-name>` という形式でコマンドを追加します。
- **自動実行とデプロイ**: 各フィードの更新頻度や実行タイミングに合わせて、`.github/workflows/` 内に GitHub Actions のワークフローを定義します。

---

## 提供中のフィード一覧

### 1. GitHub Starred Repositories Releases Feed
自分がスターをつけた GitHub リポジトリの最新リリース情報を集約するフィードです。

- **スクリプト**: [github-stars-release.js](file:///Users/rkunihiro/src/github.com/rkunihiro/feed/github-stars-release.js)
- **ビルドコマンド**: `npm run build:github-stars-release`
- **ワークフロー**: [.github/workflows/github-stars-release.yml](file:///Users/rkunihiro/src/github.com/rkunihiro/feed/.github/workflows/github-stars-release.yml)
- **公開フィード URL**: `https://github.rkunihiro.dev/feed/github-stars-release.xml`
- **主な機能**:
  - 指定したユーザーのスター付きリポジトリから、最新のリリース情報を GraphQL API を用いて収集します。
  - 公開日時の降順にソートし、最新の 50 件を RSS 2.0 形式で出力します。

---

## 必要要件

- Node.js (v24 以上推奨)
- GitHub アカウントおよび Personal Access Token (PAT / `GITHUB_TOKEN`) などの、各フィードが必要とする認証トークン・API キー

---

## ローカルでの開発・実行方法

### 1. 依存関係のインストール

このプロジェクトは Node.js の標準 API（`fetch` や `fs/promises` など）のみで動作するよう設計されているため、外部のパッケージ依存関係はありません。

### 2. 環境変数の設定

各フィードの実行に必要な環境変数を設定します。

#### GitHub Starred Repositories Releases 用の環境変数:

| 環境変数名 | 必須 | 説明 |
| :--- | :---: | :--- |
| `GITHUB_TOKEN` | 必須 | GitHub API にアクセスするためのトークン（スター情報およびリリースの読み取り権限） |
| `GITHUB_USERNAME` | 任意 | スターを取得したい GitHub ユーザー名（未指定の場合は `GITHUB_REPOSITORY_OWNER` または `GITHUB_REPOSITORY` のオーナー名が使用されます） |
| `GITHUB_REPOSITORY` | 任意 | フィード公開用リポジトリ名 (例: `owner/repo`) |

### 3. スクリプトの実行

各フィードのビルドコマンドを実行して、`docs/` ディレクトリ配下に XML ファイルを生成します。

```bash
# 例: GitHub Starred Repositories Releases フィードの生成
npm run build:github-stars-release
```

---

## 新しいフィードを追加する手順

このリポジトリに新しいフィードを追加する場合は、以下の手順で行います。

1. **スクリプトの作成**:
   ルートディレクトリに新しい JavaScript ファイル（例: `my-new-feed.js`）を作成し、フィード生成ロジックを実装します。生成する XML は `docs/` ディレクトリ内（例: `docs/my-new-feed.xml`）に出力するようにしてください。
2. **`package.json` への登録**:
   `scripts` にコマンドを追加します。
   ```json
   "build:my-new-feed": "node my-new-feed.js"
   ```
3. **GitHub Actions ワークフローの作成**:
   `.github/workflows/my-new-feed.yml` を作成し、定期実行スケジュール（Cron）と、ビルド・デプロイ処理を記述します。デプロイ先は `gh-pages` ブランチの `docs/my-new-feed.xml` となるように設定します。
