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

## 人や時期で変わるもの

体重・目標トータル・階級・大会日・フェーズ表・サイクルは、コードにも初期値にも持たない。
初めて開いたときの「はじめに」で聞いて作り、あとは設定画面で変える。

- **階級の判定**は任意。使う場合は「いまの階級」と「上の階級」の名前・標準記録・着地目標を設定する。
- **必要ペースの係数と予測の倍率**は、サイクルの編集で本命大会の日付から候補が出る。
- **落ち幅の閾値**は、増量終了時のトータルに対する割合（既定 2% / 3%）。
- **ウエスト・体脂肪率・カロリー・測定**は、設定の「記録する項目」で隠せる。
- 要件定義どおりの設定例は `src/domain/example.ts`（テストと開発用サンプルに使う）。

## 計算まわり

- **推定1RMの式**：設定で Epley / Brzycki / Lombardi / O'Conner / Wathan から選べる。独自の式も
  `w * (1 + r / 30)` のように書いて追加できる（変数 `w` `reps` `rpe` `rir` `r`、関数 `exp ln log10 sqrt abs pow min max`）。
  式は `src/domain/expr.ts` の評価器が数式としてだけ解釈し、プログラムとしては実行しない。
- **サイクル**：判定の対象（基準日・増量終了日・減量終了日・基準トータル）は設定の「サイクル」で申告する。
  フェーズ表は目標体重ラインとアラート用で、判定の期間は自動では変わらない。
- **書き出し**：記録（入力値）は JSON / CSV、結果（計算値）は JSON と週次の表 CSV。結果の JSON には使った式と設定が入る。
- **CSV の取り込み**：体重は `date, weight, bodyfat, kcal, protein`、トップセットは
  `date, lift, weight, reps, rpe, comp, memo`。このアプリが書き出した CSV もそのまま読める。

## 構成

| 場所 | 内容 |
|---|---|
| `src/domain/` | 計算（要件定義 5章）。画面にも保存にも依存しない |
| `src/db/` | 端末内への保存、バックアップの書き出し・読み込み |
| `src/sync/` | Google Drive との同期 |
| `src/ui/` | 画面 |

計算に使う数値（標準記録、係数、閾値）は設定画面で変えられる。初期値は `src/domain/defaults.ts`。
