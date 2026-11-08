# TeX Sync

日本語 | [English](README.en.md)

> **Note:** この拡張機能をメンテナンスするつもりはありません。動かなかったら Fork して好きにしてね♡

LaTeX を書いている間、PDF をカーソル位置に追従させる VS Code 拡張機能です。
TeX エンジンが出力する SyncTeX の「ソースマップ」(`.synctex.gz`)を読み取り、
[LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop) の PDF ビューアを操作します。

## 機能

3 つの機能はそれぞれ独立して、設定・コマンドパレット・ステータスバーのメニューから
オン/オフを切り替えられます。

### カーソル追従(`texSync.follow.enabled`)

TeX エディタでカーソルが動くたびに(デバウンス付き)、PDF ビューアが対応する位置へジャンプします。
キーを押さなくても forward SyncTeX が走るイメージです。

拡張機能自身が `.synctex(.gz)` を解析し、無駄なビューア呼び出しを避けます。

- SyncTeX のレコードがない行(プリアンブル、コメント、マクロ)ではジャンプしません。
- 解決された PDF 上の位置が前回と同じなら、ビューアには触れません。
- タイピングによるカーソル移動はデフォルトで無視します。次のビルドまで SyncTeX のデータが
  古いままだからです(`texSync.follow.syncWhileTyping`)。
- プログラムによる選択変更(LaTeX Workshop 自身の逆検索、つまり PDF 上の Ctrl/Cmd+クリックを含む)は
  デフォルトで無視するため、フィードバックループは起きません(`texSync.follow.triggerKinds`)。

### PDF の自動オープン(`texSync.autoOpenPdf.enabled`)

TeX ドキュメントがアクティブになり、対応する PDF が存在する場合、隣のエディタグループに
LaTeX Workshop のビューアで PDF を開きます。各 PDF はセッションごとに最大 1 回しか開かないので、
閉じたビューアタブは閉じたままです。もう一度開きたいときは **TeX Sync: Open PDF Beside** を
明示的に実行してください。

### ビルド後の変更箇所ハイライト(`texSync.highlightChanges.enabled`)

ビルドによって `.synctex.gz` が書き換えられると、前回のビルドから変更された行が PDF 上で点滅します。
変更行ごとに半透明の青い枠が表示され、1 秒ほどでフェードアウトします。この表示は LaTeX Workshop の
「rectangle」SyncTeX インジケータを利用しているため、`latex-workshop.synctex.indicator` は
デフォルトの `rectangle` のままにしておく必要があります。

- 差分は前回ビルド時と今回ビルド時のソース(保存時にスナップショットを取得)の間で取ります。
  そのため点滅するのは挿入・変更された行のみで、削除は指す先がないため対象外です。
- SyncTeX のレコードがない行(プリアンブル、マクロ定義、Lua コード)はスキップします。
- 点滅する行数は最大 `texSync.highlightChanges.maxLines` 行です。ビューアは最後の変更箇所に
  留まります。カーソル位置に戻したい場合は `texSync.highlightChanges.scrollToChange` を `false` に
  してください。
- セッション中に最初に検知したビルドではスナップショットを記録するだけで、何も点滅しません。

### ステータスバー

`$(eye) TeX Sync p.3` のように、カーソルが対応するページを表示します。クリックすると、各機能のトグル、
「今すぐ同期」、「隣に PDF を開く」、「SyncTeX データの再読み込み」、ログ、設定を含むメニューが開きます。

## 必要なもの

- [LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop)
  (拡張機能の依存関係として宣言しています。ビルドと PDF ビューアは LaTeX Workshop が担当します)
- SyncTeX を有効にしたビルド(`-synctex=1`。LaTeX Workshop のデフォルトレシピは有効になっています)

この拡張機能はドキュメントのビルドを行いません。既存のワークフローが出力する `.synctex(.gz)` と `.pdf` を
読み取り、変更を監視するだけです。

## コマンド

| コマンド                           | 説明                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| `TeX Sync: Toggle Cursor Follow`   | 自動 forward search のオン/オフ                        |
| `TeX Sync: Toggle Auto-open PDF`   | TeX ファイルの隣に PDF を開く機能のオン/オフ           |
| `TeX Sync: Sync PDF to Cursor Now` | 重複除去を無視して 1 回だけ forward search を実行      |
| `TeX Sync: Open PDF Beside`        | アクティブなドキュメントの PDF を隣のグループで開く    |
| `TeX Sync: Reload SyncTeX Data`    | 解析済みキャッシュを破棄してファイルを再読み込み       |
| `TeX Sync: Show Menu` / `Show Log` | ステータスバーのメニュー / 出力チャンネル              |

## 設定

| 設定                                   | デフォルト             | 説明                                                                       |
| -------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `texSync.follow.enabled`               | `true`                 | カーソル移動時に自動 forward search                                        |
| `texSync.follow.debounceMs`            | `150`                  | 最後のカーソル移動からの遅延                                               |
| `texSync.follow.triggerKinds`          | `["keyboard","mouse"]` | 同期のトリガーとなる選択変更の種類(`command`、`programmatic` も指定可)   |
| `texSync.follow.syncWhileTyping`       | `false`                | 編集によるカーソル移動でも同期する                                         |
| `texSync.follow.skipUnchangedPosition` | `true`                 | 解決された位置が変わらないときはビューア呼び出しをスキップ                 |
| `texSync.follow.positionTolerance`     | `2`                    | 「変わらない」とみなす縦方向の許容差(PDF ポイント)                       |
| `texSync.autoOpenPdf.enabled`          | `true`                 | TeX ドキュメントの隣に PDF を開く                                          |
| `texSync.autoOpenPdf.delayMs`          | `300`                  | 自動オープンまでの遅延                                                     |
| `texSync.statusBar.enabled`            | `true`                 | ステータスバー項目を表示                                                   |
| `texSync.synctex.include`              | `**/*.synctex{,.gz}`   | SyncTeX ファイルを探す glob                                                |
| `texSync.synctex.exclude`              | `**/node_modules/**`   | 無視する glob                                                              |

## 仕組み

1. ワークスペース内(および開いているドキュメントの隣)の SyncTeX ファイルを検出し、
   `(file, line) → (page, x, y)` のテーブルに解析します。入力パスは SyncTeX ファイルのディレクトリと
   その親ディレクトリを基準に解決するため、`-outdir` を使ったビルドでも動作します。
2. カーソル移動時に現在行を検索します(最も近いマップ済みの行を採用し、同距離なら後ろの行を優先)。
3. 移動先が新しい位置であれば、行とファイルを指定して `latex-workshop.synctexto` を呼び出し、
   LaTeX Workshop がビューアを移動させます。
4. `.synctex(.gz)` が再ビルドされるたびに、ファイルウォッチャーがキャッシュを無効化します。

## 開発

ツール: [mise](https://mise.jdx.dev)(Node LTS + pnpm)と [Vite+](https://viteplus.dev)
(`vp pack` → tsdown バンドル、`vp test` → Vitest、`vp check` → Oxfmt + Oxlint + 型チェック)。

```sh
mise install
pnpm install
pnpm run build      # dist/extension.cjs にバンドル
pnpm run test       # ユニットテスト(パーサー、ロケータ、入力パス解決)
pnpm run check      # フォーマット + lint + 型
pnpm run package    # .vsix を作成
```

VS Code で <kbd>F5</kbd> を押すと Extension Development Host が起動します。

パーサーのテストは `test/fixtures/sample/main.synctex(.gz)` に対して実行されます。このファイルは
同じディレクトリの `.tex` から `latexmk -pdf -synctex=1` で生成したものです。

## ライセンス

MIT
