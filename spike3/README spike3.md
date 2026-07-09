# ヨルノハコニワ Spike 3 実機テスト
V6セーブ永続化 + 3手詰探索(T7) + V4描画性能。Spike 2の94件は回帰として同梱(計106件)。

## 1. 公開手順
リポジトリに **`spike3/` フォルダ**を作成し、以下をアップロード(spike1/spike2には触れない):
`index.html` `tsume.html` `save.html` `save.js` `perf.html` `perf.js` `engine.js` `runner.js` `style.css` + `tests/`(7ファイル)

URL: `https://<ユーザー名>.github.io/<リポジトリ名>/spike3/`(メニューから各検証へ)

> Node事前検証済み: **PASS 106 / FAIL 0**(T1〜T7)。判定コアは実機と同一コード。

## 2. 実機チェックリスト
| # | ページ | 項目 | 合格基準 |
|---|---|---|---|
| F-1 | tsume | ビルドID照合 | 4値(HTML/CSS/JS/ENGINE)が s3-001 で一致 |
| F-2 | tsume | 全テスト実行 | **PASS 106 / FAIL 0** |
| F-3 | tsume | perft時間 | 値一致+d1〜d4の時間記録 |
| F-3b | tsume | 3手詰時間 | findAllMateMoves(3) 最大**200ms以下**(Node実測: 最大35ms) |
| F-4 | save | 容量テスト | 500KBの書込・読出成功(目安100ms以下)。1MB/5MBの成否も記録 |
| F-5 | save | 永続性 | Safariを完全終了→再訪で①の識別IDが同じ/⑥のestimate値を記録 |
| F-6 | save | 書き出し3方式 | A(コピー)/B(共有)/C(ダウンロード)の成否と使い勝手を記録。⑤で読み込み検証OK |
| F-7 | save | **PWA分離** | Safariとホーム画面起動で①のIDを比較(手順はメニューに記載) |
| F-8 | save | プライベートブラウズ | プライベートタブで開き、①⑥の挙動を記録 |
| F-9 | perf | FPS 3分ソーク | 最小**55fps以上**を3分維持(粒100)。低電力モードON時の値も記録 |

## 3. 結果記録テンプレート
```
■ Spike 3 実機テスト結果
機種/iOS/起動方法:
Build ID(4値):
F-1: 合格/不合格   F-2: PASS __/FAIL __
F-3: d1=__ms d2=__ms d3=__ms d4=__ms   F-3b: 3手詰 最大__ms
F-4: 500KB 書__ms/読__ms  1MB:__  5MB:__
F-5: 再起動後ID一致 はい/いいえ  estimate: __
F-6: A:__ B:__ C:__ / 読み込み検証: OK/NG / 推奨したい方式: __
F-7: SafariのID=__ / ホーム画面のID=__ → 同一/別
F-8: プライベート時の挙動: __
F-9: 通常 平均__fps 最小__fps / 低電力 平均__fps(ログ貼り付け)
不具合・気づき:
```

## 4. ビルドID運用(更新時は16箇所を同じ新IDへ)
| ファイル | 箇所数 | 内容 |
|---|---|---|
| tsume.html | 4 | BUILD_HTML + style/engine/runnerの?v |
| save.html / perf.html | 各3 | BUILD_HTML + style/自JSの?v |
| index.html | 1 | styleの?v |
| engine.js / runner.js / save.js / perf.js / style.css | 各1 | BUILD定数 / probe |

## 5. 変更履歴
### s3-001 (2026-07-09) 初版
- エンジン拡張: `mateWithin` / `findAllMateMoves` / `isCorrectMateMove`(攻方=王手のみ、n手**以内**、
  無駄合い実用ルール「合駒→王手での即取り返しが詰み継続なら往復を手数に数えない(1往復まで)」実装)
- **T7相互検証の記録**: 初回2局面不一致 → ①T7-03: G*2b/S*2b(と金に紐づく頭金・頭銀の1手詰)の
  人手打点見落とし=エンジンが正、テスト修正。②T7-08: 退路封鎖の後手香(2a)が下向きの利きで
  2bを守り不詰=**テスト局面の設計欠陥**をエンジンが検出、封鎖役を先手金(3a)へ再設計。
  修正後、T7 12件全一致(実機と同一コアでNode 106/106)
- V6セーブ検証ページ(識別ID/容量/5000問モック=チェックサム付/書き出し3方式/読込検証/storage情報)
- V4描画性能ページ(タイル+NPC10+粒50〜500、1秒バケットFPS、15秒スナップショット、3分ソーク)
- 7日削除規則の長期観察マーカー開始(save①の「前回書込からの経過日数」)
