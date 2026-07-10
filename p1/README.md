# ヨルノハコニワ 本実装リポジトリ — P1-b(平坦配置版 p1-003)
将棋モジュール接続 + 盤ウィジェット製品化。ダミー教科はdummy.htmlで常設(分離実証)。

## 配置(重要): 全30ファイルをリポジトリ直下に置く(フォルダなし)
iPhoneのみの運用でフォルダ階層の再構築ミスが起きたため、p1-003から**平坦配置を正式採用**。
- **実機動作に必要な16ファイル**: index.html / dummy.html / board_sandbox.html / style.css /
  boot.js / sandbox.js / core_data.js / input_audio.js / world_encounter.js / save_core.js /
  engine.js / subject.js / widget.js / map_test.json / problems_dummy.json / problems_shogi.json
- リポジトリ管理用14ファイル(なくても動く): VERSION.txt / run_node.js / build.py /
  t1〜t8のテスト8件 / README.md / PROJECT.md / DEVELOPMENT_RULES.md
- **スペース入りの重複ファイル(「core data.js」等)はすべて削除対象**

## 公開手順
1. **新規リポジトリ**(推奨名 `yorunohakoniwa`)にこのフォルダ一式をアップロード(ローカルで構成してpush。Web UIでのフォルダ再編禁止=規約§4)
2. Settings → Pages を有効化 → `https://<ユーザー名>.github.io/yorunohakoniwa/`

## P1-b 実機確認項目(H-1〜H-9)※Nodeが通っても実機NGなら不合格
| # | ページ | 項目 | 合格基準 |
|---|---|---|---|
| H-1 | index | ビルドID | 4値が p1-002 で一致 |
| H-2 | **board_sandbox** | 盤単体 | Spike 1のB項相当(タップ2段/解除/選び直し/端マス/連打/2本指)+ページ内の確認6項目すべて |
| H-3 | sandbox | 駒台と打ち | 駒を取ると駒台に出る。駒台タップ→打てるマスが光る→打てる(二歩の筋は光らない) |
| H-4 | sandbox+本編 | 成り選択 | ダイアログで成/不成を選べる。歩香桂の行き所は自動成り。**S-TSUME1-002で「成」だけが正解になる** |
| H-5 | sandbox | ドラッグ | 盤上の駒をドラッグして着手できる(ゴーストが追従)。※打ちはタップのみ(P1-b仕様) |
| H-6 | 本編 | 反則タップ | 王手放置等をタップ→着手されず、ギョクのセリフが出る。**ヒント消費なし** |
| H-7 | 本編 | 3形式 | 詰将棋(別解も正解)/次の一手(wrongMovesの個別セリフ)/定跡(8八角成→専用セリフ)が同じ流れで動く |
| H-8 | 本編 | ループ一周 | 探索→接触→将棋→正解→浄化→探索再開。不正解→局面が出題時に戻って再挑戦 |
| H-9 | 本編 | 浄化セーブ | 浄化後にリロード→その敵が復活しない(P1-aの既知の制限を解消) |
| 任意 | dummy | 分離実証 | dummy.htmlで「かずあてクイズ」が同じコアで動く |

## 既知の制限(仕様)
- 持ち駒の「打ち」はタップのみ(ドラッグ打ちはPhase 6の磨き込みで検討)
- AI対局・会話・クエスト・昇級試験・音楽なし(P1-c以降/Phase 2以降)

## 開発コマンド
- 回帰: `node run_node.js`(106件。エンジンに触れたら必須)
- コア単体テスト: README記載のnodeワンライナー(core_data 8件)
- **デプロイ前**: `python3 build.py p1-004` 等(ID刻印29箇所+回帰127件ゲート。失敗時は自動ロールバック)

## Change Log
### p1-005 (2026-07-10) 成り選択が確定できない不具合の修正(実機報告対応)
- [運用] build.pyを「全検証→合格後に一括書込」の2段方式へ改修(検証失敗時に部分刻印が残る欠陥を修正。
  今回、コメントへの版番号混入をゲートが検出した際に混在状態が発生したため)
- **原因**: 盤の委譲ハンドラがpointerdownでpreventDefaultしており、iOS Safariでは後続のclickが
  発火しない。成りボタンはclick確定だったため押しても確定不能だった
- 修正①: ダイアログ(.sw-promo)内のタップは委譲処理・preventDefaultの対象外に
- 修正②: ボタン確定をpointerupへ変更(click併設・doneフラグで二重発火防止)
- [診断] 成り選択の表示時にpending両手(成/不成のUSI)、確定時に選択値・promote・USIをログ
- 強制成りの自動処理は無変更。通常タップ系も無変更。Node 127/127維持
### p1-004 (2026-07-10) 盤タップ不能の修正(実機報告対応)
- **原因**: 成り選択オーバーレイ(.sw-promo)が非表示にならず盤全体を覆っていた(症状「盤が暗い」「タップ無反応」)。
  ユーティリティ.hiddenが、後から定義したdisplay:flex宣言にカスケードで負けるCSSバグ。
  .enc-overlay/.clear-bannerも同罪だったため、.hiddenを!importantに変更して一括修正
- [診断] sandbox: document捕捉フェーズでelementFromPointの最前面要素を毎タップ記録 /
  widgetにdebugフック(target・マス座標・locked・選択状態) / unhandledrejection捕捉(本編にも)
- Node 127/127維持
### p1-003 (2026-07-10) 平坦配置版
- 実機報告: iPhoneアップロードでフォルダ構造が平坦化され、js/配下が404→盤が空(診断版で確定)
- 全ファイルをリポジトリ直下に置く**平坦配置を正式採用**。HTML参照・JSON読込(直下優先)・
  run_node.js・build.pyを直下用に変更。機能・テスト・ファイル名(アンダースコア)は無変更
- Node 127/127維持。刻印29箇所
### p1-002 (2026-07-09) P1-b
- 将棋SubjectModule(subject.js): judge層DOM非依存(match/mate)・USI→日本語表記・反則→ギョクのセリフ7種
- 盤ウィジェット(widget.js): 9×9+駒台、タップ2段+ドラッグ、**真の合法手ハイライト(反則手は選べない)**、成り選択ダイアログ(強制成り自動)、120ms移動アニメ+入力ロック、B案サイズ既定
- サンプル6問(詰将棋2/次の一手2/定跡2)を**収録前機械検証つき**で追加
- 契約v1.1: callbacks.onInfo(正誤に影響しない表示)/createWidgetハンドルreset()(再挑戦時の局面復帰)を追加(記録: コア変更はこの2点のみ)
- 浄化状態をセーブ(world.defeated)し復元。教科レジストリ(SUBJECT_ID)でdummy.html常設
- **テストファーストの成果**: T8作成時のSFEN誤記(と金1b/正=2c)をゲートが実装前に捕捉→修正
- Node: 回帰106+T8 21=**127/127**。tools/build.py刻印29箇所に更新
### p1-001 (2026-07-09) P1-a初版
- engine/: core_data(セーブv1+CRC32+復習スケジューラ+報酬) / input_audio(4入力抽象化+SE) / world_encounter(タイルマップ+出題フロー) / save_core(localStorage+書き出し/読み込み+Core結線)
- subjects/: quiz-dummy(SubjectModule契約の分離実証) / shogi/engine.js(Spike 3から引き継ぎ・106件ゲート)
- tools/build.py: ビルドID自動刻印+回帰ゲート(手動更新の廃止)
- Node検証: 回帰106/106 + core_data単体8/8 + build.py往復動作
