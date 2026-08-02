# Go, ReactによるTodoアプリ作成

Go言語とTypeScript、Reactの練習としてTodoアプリを作成しています。

## ブランチ

- main：メイン
- develop：開発用
- in-memory-slice：DBの代わりにスライスを使った時の内容。保存用

## デプロイ

概要
- フロント: Firebase Hosting
- バック: Cloud Run
- DB: Neon(Postgres)
- CI/CD: GitHub Actions

バックエンド：Dockerfileの分割
- docker-compose.ymlはローカル専用
- Dockerfile.localではAirを導入しホットリロードに対応する
- Dockerfileではマルチステージビルドに対応し、最終的なイメージサイズを圧縮する

バックエンド：シークレットやローカルと異なる変数の管理
- ローカルでは`.env`を使用
- デプロイ時にはGoogle CloudやGitHubに対して変数を追加する
