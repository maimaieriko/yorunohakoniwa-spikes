/* ============================================================
   ヨルノハコニワ - 将棋SubjectModule (subjects/shogi/subject.js)
   judge層はDOM非依存(NodeでT8テスト)。createWidgetはブラウザでのみ定義。
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    root.Hakoniwa = root.Hakoniwa || {};
    root.Hakoniwa.SubjectShogi = factory(root.ShogiEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const KANJI = { K: '玉', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };
  const KANJI_PROMOTED = { R: '竜', B: '馬', S: '全', N: '圭', L: '杏', P: 'と' };
  const NUM_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 反則理由コード → ギョクのセリフ(README_tests §3の対応表・承認済み文言案)
  const GYOKU_REASON = {
    NIFU: 'おなじ たてのれつに、歩は 2まい おけないんだ(にふ)',
    DEAD_PIECE: 'そこに いくと、もう うごけなくなっちゃうよ',
    UCHIFU_ZUME: 'もちごまの 歩で つませるのは はんそくなんだ(うちふづめ)',
    KING_IN_CHECK: 'その手だと、王さまが とられちゃう!',
    BAD_PROMOTION: 'ここでは なれないよ',
    BAD_MOVEMENT: 'そのこまは、そこへは うごけないよ',
    BAD_DROP: 'そこには うてないよ',
  };

  // ---------- judge層(DOM非依存) ----------
  function loadProblem(data) {
    // コアは解釈しない共通フィールド+payload。ここでSFENの妥当性を先に確認
    E.parseSfen(data.payload.sfen);
    return data;
  }

  function judge(problem, usi) {
    const p = problem.payload;
    if (p.judge === 'mate') {
      const pos = E.parseSfen(p.sfen);
      return { correct: E.isCorrectMateMove(pos, usi, p.mateN) };
    }
    // match方式(次の一手・定跡)
    if ((p.correctMoves || []).includes(usi)) return { correct: true };
    const w = (p.wrongMoves || []).find((x) => x.move === usi);
    return { correct: false, message: w ? w.message : null };
  }

  // USI → 子ども向け日本語表記(例: 7六歩 / 4三桂打 / 5二歩成 / 2四飛)
  function usiToJapanese(sfen, usi) {
    const pos = E.parseSfen(sfen);
    const mv = E.parseMove(usi);
    const sq = `${mv.to.f}${NUM_KANJI[mv.to.r - 1]}`;
    if (mv.drop) return `${sq}${KANJI[mv.drop]}打`;
    const pc = pos.board[(mv.from.r - 1) * 9 + (mv.from.f - 1)];
    const name = pc ? (pc.promoted ? KANJI_PROMOTED[pc.letter] : KANJI[pc.letter]) : '?';
    return `${sq}${name}${mv.promote ? '成' : ''}`;
  }

  function answerText(problem) {
    const p = problem.payload;
    if (p.judge === 'mate') {
      const mates = E.findAllMateMoves(E.parseSfen(p.sfen), p.mateN);
      return mates.map((m) => usiToJapanese(p.sfen, m)).join(' か ');
    }
    return p.correctMoves.map((m) => usiToJapanese(p.sfen, m)).join(' か ');
  }

  const subject = {
    meta: { id: 'shogi', name: 'しょうぎ', schema: 1 },
    engine: E,
    GYOKU_REASON,
    loadProblem,
    judge,
    answerText,
    usiToJapanese,
    selfTest() { return true; }, // 回帰はrun_node.js(106件+T8)が担う
  };

  // ---------- ブラウザ側: createWidget(盤ウィジェットへ委譲) ----------
  if (typeof document !== 'undefined') {
    subject.createWidget = function (container, problem, callbacks) {
      const W = (typeof self !== 'undefined' ? self : window).Hakoniwa.ShogiWidget;
      const widget = W(container, {
        sfen: problem.payload.sfen,
        onMove(usi) { callbacks.onAnswer(usi); },
        onIllegal(reason) {
          if (callbacks.onInfo) callbacks.onInfo(`ギョク「${GYOKU_REASON[reason] || 'その手は できないよ'}」`);
        },
      });
      // 契約v1.1: createWidgetはハンドルを返してよい(reset=再挑戦時の局面復帰)
      return { reset() { widget.setPosition(problem.payload.sfen); } };
    };
  }

  return subject;
});
