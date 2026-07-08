# ヨルノハコニワ Spike 2 実機テストランナー
iPhone/iPad Safari でエンジン核(SFEN/USI・反則50件・perft・1手詰)の94件を実行する。

> ランナーの判定コアはNode版と**完全に同一のコード**(runner.js内のrunAllSuites)。
> Nodeで94/94全通過を確認済みのため、実機で差が出れば**それはSafari環境固有の問題**と切り分けられる。

---

## 1. 公開手順

1. Spike 1のリポジトリに **`spike2/` フォルダを作成**し、以下の10ファイルをアップロード:
   - `index.html` / `style.css` / `runner.js` / `engine.js`
   - `tests/` フォルダごと6ファイル(t1_sfen.json 〜 t6_tsume1.json)
2. 5〜10分待つ(GitHub Pagesの反映遅延)
3. 以下のURLをiPhone/iPad Safariで開く:

```
https://<ユーザー名>.github.io/<リポジトリ名>/spike2/
```

※Spike 1とは独立したページ。Spike 1側のファイルには一切触れない。

---

## 2. 実機テスト手順(5〜10分)

1. ページを開く → 画面上部の**ビルドIDが4つとも `s2-001`** であることを確認(E-1)
2. **「全テスト実行(94件)」を1回タップ** → T1〜T6のカードが順に緑になる
   - perft深さ4で数秒止まって見えるのは正常(ログに「実行中…」が出る)
3. 完了後、上部に「合計 PASS 94 / FAIL 0 — 全通過!」が出ること(E-2)
4. ログの `perft実測: d1=…ms / d2=… / d3=… / d4=…` を記録(E-3)
5. ログの `findAllMates: 最大…ms` が **50ms以下**であること(E-4)
6. **「ログをコピー」→ メモ等に貼り付け**られること(E-5)
7. 実行中にSafariが固まる・落ちる・スクロール不能にならないこと(E-6)
8. できればiPhoneとiPadの**両方**で実施(性能値は両方記録)

### 判定基準
| # | 項目 | 合格基準 |
|---|---|---|
| E-1 | ビルドID照合 | HTML/CSS/JS/ENGINEの4値が一致(赤警告なし) |
| E-2 | 94件実行 | PASS 94 / FAIL 0 |
| E-3 | perft | d1=30, d2=900, d3=25470, d4=719731 が一致。d1〜d3の時間を記録 |
| E-4 | 1手詰速度 | findAllMates 最大50ms以下 |
| E-5 | ログコピー | クリップボード経由で貼り付け可能 |
| E-6 | 安定性 | フリーズ・クラッシュなし |

---

## 3. 実機テスト結果 記録テンプレート

```
■ Spike 2 実機テスト結果
機種        : (例: iPhone SE 第2世代)
iOS         : 
Safari      : (標準Safari / ホーム画面追加)
URL         : 
Build ID    : (4値すべて記入)
テスト日時  : 

【結果】
E-1 ビルドID照合  : 合格 / 不合格
E-2 94件実行      : PASS __ / FAIL __
E-3 perft         : d1=__ms d2=__ms d3=__ms d4=__ms(値の一致: はい/いいえ)
E-4 findAllMates  : 最大__ms / 平均__ms
E-5 ログコピー    : 合格 / 不合格
E-6 安定性        : 合格 / 不合格(症状:      )

【不合格がある場合】
該当項目・再現手順:
ログ貼り付け:
スクリーンショット:
```

---

## 4. ビルドID運用(更新時のルール)

ファイルを1つでも変更したら、**次の7箇所を同じ新IDに更新**(例: s2-001 → s2-002):

| ファイル | 箇所 |
|---|---|
| index.html | `window.BUILD_HTML = 's2-001';` |
| index.html | `style.css?v=` / `engine.js?v=` / `runner.js?v=` の3箇所 |
| style.css | `#css-build-probe::after { content: 's2-001'; }` |
| runner.js | `const BUILD_JS = 's2-001';` |
| engine.js | `BUILD: 's2-001',` |

テストJSONは `?v=ビルドID` + `cache: no-store` で取得するため個別ID不要。

---

## 5. 参考: Node実行(開発時の回帰確認)

```
node run_node.js        # 従来ランナー(94件)
```
runner.jsのコアはNodeからも実行可能(実機UIと同一判定コードの検証用)。
