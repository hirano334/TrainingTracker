# 増減量サイクル記録

増減量サイクルの体重・BIG3 のトップセットを記録し、標準記録に届くペースかどうかと、
74kg級／83kg級のどちらを目指すかを判定する、スマホ向けの Web アプリ（PWA）。
仕様は [cycle_tracker_requirements.md](cycle_tracker_requirements.md)。

## 使う

```
npm install
npm run dev      # http://localhost:5173
npm test         # 計算・保存・同期のテスト
npm run build    # dist/ に出力
```

## 公開（GitHub Pages）

1. GitHub にリポジトリを作り、`main` に push する。
2. リポジトリの Settings → Pages → Source を **GitHub Actions** にする。
3. push のたびに [.github/workflows/deploy.yml](.github/workflows/deploy.yml) がテスト・ビルド・公開を行う。
4. スマホで公開 URL を開き、ブラウザのメニューから「ホーム画面に追加」する。
   ホーム画面に追加しないと、iOS では長く開かなかったときに記録が消されることがある。

## 記録の保存先

記録は端末のブラウザ内（IndexedDB）に保存される。別の端末と共有するには、設定画面から
バックアップを書き出して読み込むか、Google Drive 同期を使う
（準備は [docs/google-drive-setup.md](docs/google-drive-setup.md)）。

## 構成

| 場所 | 内容 |
|---|---|
| `src/domain/` | 計算（要件定義 5章）。画面にも保存にも依存しない |
| `src/db/` | 端末内への保存、バックアップの書き出し・読み込み |
| `src/sync/` | Google Drive との同期 |
| `src/ui/` | 画面 |

計算に使う数値（標準記録、係数、閾値）は設定画面で変えられる。初期値は `src/domain/defaults.ts`。
