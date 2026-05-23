# GlossView for GitHub

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md)

GitHub ページ上で [Gloss Markdown](https://github.com/aXisho/glossmd) の directive を描画する Chrome 拡張機能です。GitHub で `.gloss.md` ファイルを閲覧すると、拡張機能がページに介入し、directive マークアップをリッチな UI（コールアウト、タブ、バッジ、グリッド、ステップなど）に変換します。

## できること

GitHub はほとんどの Gloss Markdown directive をそのままある程度見やすく描画します（Alert コールアウト、コードブロック、インラインコード）。この拡張機能はその体験をさらに向上させます。

**ファイルビュー**（`.gloss.md` blob ページ）：

1. 現在の GitHub ページが `.gloss.md` ファイルであることを検出する。
2. `raw.githubusercontent.com` から生ソースを取得する。
3. Gloss Markdown の directive ツリーを解析する。
4. ページの markdown コンテナを完全な Gloss Markdown 出力で再描画する。directive ブロックはスタイル付きの DOM 要素（タブ UI、折りたたみ詳細、色付きコールアウトなど）に置き換えられ、テキストは [marked.js](https://marked.js.org/) で描画される。

**編集ページプレビュー**（`/edit/` URL）：

`.gloss.md` ファイルの編集中に **Preview** タブをクリックすると、拡張機能が GitHub のレンダリング済みプレビューをその場で拡張します。生ソースを再取得することなく Gloss の fenced directive ブロック（heading・inline・TOC も含む）を置き換えるため、未保存の編集内容がプレビューに反映されます。

**Gist ページ**：

ファイル名が `.gloss.md` または `.gloss` で終わる Gist ファイルを自動検出し、`gist.githubusercontent.com` から生コンテンツを取得して描画します。

## サポートする directive

| Directive | 記法 | 説明 |
|-----------|------|------|
| `info` / `tip` / `important` / `warning` / `danger` | `> [!TYPE] title` | コールアウトブロック（GitHub Alert） |
| `details` | ` ```details ` フェンス | 折りたたみセクション |
| `card` | ` ```card ` フェンス | ボーダー付きカード |
| `tabs` / `tab` | ` ````tabs ` + ネストした ` ```tab ` | タブコンテンツ |
| `steps` / `step` | ` ````steps ` + ネストした ` ```step ` | 番号付きステップリスト |
| `grid` / `cell` | ` ````grid ` + ネストした ` ```cell ` | CSS グリッドレイアウト |
| `math` | ` ```math ` フェンス | 数式（KaTeX MathML） |
| `toc` | `> [!toc ...]` | 自動生成目次 |
| `badge` | `` `text`{badge ...} `` | インラインピルバッジ |
| `small` | `` `text`{small} `` | 小さいミュートテキスト |
| `big` | `` `text`{big} `` | 大きめの強調テキスト |
| `kbd` | `` `text`{kbd} `` | キーボードキー表示 |
| `heading` | `` ## `Title`{heading color=blue} `` | 背景色付き見出し |

GitHub Flavored の脚注（`[^id]`）も、GitHub 本体と同じ定義・逆参照レイアウトで描画されます。

描画済みコンテンツ内のコードブロックにはホバー時のコピーボタンが表示されます。

## インストール（ローカルビルド）

現時点では Chrome Web Store への公開はありません。ローカルにインストールするには：

1. 拡張機能をビルドする（下記参照）。
2. Chrome で `chrome://extensions` を開く。
3. **デベロッパーモード**（右上のトグル）を有効にする。
4. **パッケージ化されていない拡張機能を読み込む** をクリックし、`dist/glossview-for-github/` ディレクトリを選択する。

## ビルド

```bash
npm install
npm run build
```

`src/content.ts`（およびインポートされるファイル）を [Vite](https://vite.dev/) を使って `dist/glossview-for-github/src/content.js` にバンドルし、`dist/glossview-for-github-1.0.0.zip` を作成します。生成された JavaScript は `src/` には含まれません。

開発中の変更監視：

```bash
npm run watch
```

リビルド後は `chrome://extensions` の拡張機能カードのリロードボタンをクリックしてください。

## テスト

```bash
npm test
```

ユニットテストは [Vitest](https://vitest.dev/) で実行されます。

## 仕組み

```
GitHub blob ビュー (.gloss.md)
  └─ content.ts が document_idle で実行
       ├─ isGlossMdPath() → true
       ├─ getRawUrl() → https://raw.githubusercontent.com/...
       ├─ fetch(rawUrl) → 生ソーステキスト
       ├─ parseGlossMd(raw) → GlossChild[] ツリー
       ├─ renderChildren(tree) → DocumentFragment
       └─ container.replaceChildren(fragment) → DOM 更新

GitHub 編集ページプレビュー (/edit/ URL, Preview タブ)
  └─ content.ts がタブ切り替え時に拡張
       ├─ isEditPage() → true
       ├─ findEditContainer() → プレビューパネルの .markdown-body
       ├─ enhanceGitHubPreview(container)
       │    ├─ Pass 1: fenced ブロック (tabs/details/card/steps/grid/math)
       │    │    └─ <code class="language-NAME"> → renderGlossNode()
       │    ├─ Pass 2: h1〜h6 の heading directive
       │    ├─ Pass 3: インライン directive (badge/kbd/small/big)
       │    └─ Pass 4: toc blockquote
       └─ 二重処理防止のための sentinel を先頭に追加

GitHub Gist ページ
  └─ content.ts が .js-gist-file-update-container 要素をスキャン
       ├─ ファイル名が .gloss.md / .gloss で終わる
       ├─ [href*="/raw/"] リンクから rawUrl を取得
       └─ applyAndWatch(container, raw) → blob ビューと同じ描画パス
```

パーサー（`src/parser.ts`）は3種類の Gloss Markdown directive 記法（GitHub Alert、fenced コードブロック、インラインコード＋ブレース属性）を認識し、`GlossNode` / `TextNode` のツリーを生成します。レンダラー（`src/renderer.ts`）はツリーを走査し、`src/directives/` 内の各ハンドラに委譲します。marked.js の HTML 出力は [DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズされます。

## パーミッション

- `https://github.com/*` — GitHub ページへのコンテンツスクリプト注入。
- `https://gist.github.com/*` — Gist ページへのコンテンツスクリプト注入。
- `https://raw.githubusercontent.com/*` — blob ビュー用の生ファイル取得。
- `https://gist.githubusercontent.com/*` — 生 Gist ファイルの取得。

バックグラウンドサービスワーカーなし。ストレージなし。外部データ収集なし。

## 既知の制限

- **GitHub UI の変更**: GitHub はページのマークアップを変更することがあります。拡張機能が動作しなくなった場合は、`article[data-testid="rendered-markdown-container"] .markdown-body` または `.markdown-body` がレンダリングコンテナに一致するか確認してください。
- **SPA ナビゲーション**: 拡張機能は `turbo:load`、`turbo:render`、`pjax:end` イベントを監視しています。GitHub が別のルーターに移行した場合は更新が必要です。
- **編集ページプレビュー**: 拡張機能は生エディタコンテンツではなく GitHub のレンダリング済み HTML を処理するため、描画精度は GitHub の markdown → HTML シリアライズ方式に依存します。GitHub が同一の HTML を生成する構文（例: 異なる2つの Gloss directive が同じ `<code class="language-X">` になるケース）は区別できません。
