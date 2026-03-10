# Supabase Setup

## 目的

このプロジェクトは、既存の `localStorage` 保存をそのまま Supabase Cloud の `public.app_storage` テーブルへ同期する方式に変更済みです。

## 実装済みの内容

- 起動時に Supabase から `fluxview-*` キーを取得
- Supabase 側が空なら、最初の起動時にローカルデータを Supabase へ初回投入
- 以後の `localStorage.setItem/removeItem` を自動で Supabase に同期
- `fluxview-theme` はローカルのまま保持

## 1. Supabase で SQL を実行

Supabase Dashboard の `SQL Editor` で次を実行します。

- [001_app_storage.sql](/c:/wang/独自開発/FluxView/supabase/sql/001_app_storage.sql)

この SQL はデモ用に `anon` / `authenticated` へ読み書きを許可しています。
本番運用ではこのまま使わないでください。

## 2. 環境変数を設定

`UI Design from PRD/.env.example` を元に `.env.local` を作成します。

必要な値:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

参考:

- [\.env.example](/c:/wang/独自開発/FluxView/UI%20Design%20from%20PRD/.env.example)

## 3. 起動

```powershell
cd "c:\wang\独自開発\FluxView\UI Design from PRD"
npm install
npm run dev
```

## 4. 初回移行の挙動

- Supabase 側に `app_storage` のデータがある場合:
  - Supabase の内容をローカルへ復元
- Supabase 側が空の場合:
  - ブラウザの `localStorage` の `fluxview-*` を Supabase へ保存

## 5. デモ用リセット

トップバーの `データリセット` を押すと、`fluxview-*` の保存データを削除します。
Supabase 同期が有効なら、リモート側の同じキーも削除されます。

## 6. 変更した主要ファイル

- [App.tsx](/c:/wang/独自開発/FluxView/UI%20Design%20from%20PRD/src/app/App.tsx)
- [SupabaseBootstrap.tsx](/c:/wang/独自開発/FluxView/UI%20Design%20from%20PRD/src/app/components/SupabaseBootstrap.tsx)
- [supabaseClient.ts](/c:/wang/独自開発/FluxView/UI%20Design%20from%20PRD/src/app/lib/supabaseClient.ts)
- [supabaseStorage.ts](/c:/wang/独自開発/FluxView/UI%20Design%20from%20PRD/src/app/lib/supabaseStorage.ts)
