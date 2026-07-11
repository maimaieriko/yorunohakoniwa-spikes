/* ============================================================
   ヨルノハコニワ Spike 2 - 将棋エンジン核 (engine.js)
   範囲: SFEN/USI・合法手生成・反則理由コード・王手判定・perft・1手詰(findAllMates)
   方針: DOM非依存。NodeとブラウザのどちらからもロードできるUMD形式。
         速度より正しさと単純さを優先(Phase 0計画書の合意事項)。
   対象外: 千日手・入玉宣言・持将棋(Phase 1で対局機能と併せて設計)
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ShogiEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 定数 ----------
  const RANKS = 'abcdefghi';                 // rank 1..9
  const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
  const REASON = {
    NIFU: 'NIFU', DEAD_PIECE: 'DEAD_PIECE', UCHIFU_ZUME: 'UCHIFU_ZUME',
    KING_IN_CHECK: 'KING_IN_CHECK', BAD_PROMOTION: 'BAD_PROMOTION',
    BAD_MOVEMENT: 'BAD_MOVEMENT', BAD_DROP: 'BAD_DROP',
  };

  // 駒の動き。(df, dr) で dr=-1 が先手の前進(段番号減少)。後手は dr を反転。
  const STEPS = {
    P: [[0, -1]],
    N: [[-1, -2], [1, -2]],
    S: [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]],
    G: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]],
    K: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  };
  const GOLDLIKE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]]; // +P +L +N +S
  const SLIDES = {
    L: [[0, -1]],
    B: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    R: [[0, -1], [0, 1], [-1, 0], [1, 0]],
  };
  const HORSE_STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0]];   // 馬の足
  const DRAGON_STEPS = [[-1, -1], [1, -1], [-1, 1], [1, 1]]; // 龍の足

  // ---------- 盤・局面 ----------
  const idx = (f, r) => (r - 1) * 9 + (f - 1);
  const inBoard = (f, r) => f >= 1 && f <= 9 && r >= 1 && r <= 9;

  function emptyHands() { return { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }; }

  function newPosition() {
    return { board: new Array(81).fill(null), hands: { s: emptyHands(), g: emptyHands() }, turn: 's', movenum: 1 };
  }

  function clonePosition(pos) {
    return {
      board: pos.board.slice(),                       // 駒オブジェクトは不変として共有
      hands: { s: Object.assign({}, pos.hands.s), g: Object.assign({}, pos.hands.g) },
      turn: pos.turn, movenum: pos.movenum,
    };
  }

  function piece(side, letter, promoted) { return { side, letter, promoted: !!promoted }; }

  // ---------- SFEN ----------
  function parseSfen(sfen) {
    const parts = String(sfen).trim().split(/\s+/);
    if (parts.length !== 4) throw new Error('SFEN: 要素数が4でない (盤 手番 持駒 手数)');
    const pos = newPosition();
    const rows = parts[0].split('/');
    if (rows.length !== 9) throw new Error('SFEN: 段数が9でない (' + rows.length + ')');
    for (let r = 1; r <= 9; r++) {
      const row = rows[r - 1];
      let f = 9, i = 0;
      while (i < row.length) {
        let c = row[i];
        if (/[1-9]/.test(c)) { f -= Number(c); i++; continue; }
        let promoted = false;
        if (c === '+') { promoted = true; i++; c = row[i]; if (c === undefined) throw new Error('SFEN: +の後に駒がない'); }
        if (!/[plnsgkbrPLNSGKBR]/.test(c)) throw new Error('SFEN: 不明な文字 ' + c);
        if (promoted && !/[plnsbrPLNSBR]/.test(c)) throw new Error('SFEN: 成れない駒に+ ' + c);
        if (f < 1) throw new Error('SFEN: ' + r + '段目の幅が9を超える');
        const side = (c === c.toUpperCase()) ? 's' : 'g';
        pos.board[idx(f, r)] = piece(side, c.toUpperCase(), promoted);
        f--; i++;
      }
      if (f !== 0) throw new Error('SFEN: ' + r + '段目の幅が9でない');
    }
    if (parts[1] !== 'b' && parts[1] !== 'w') throw new Error('SFEN: 手番はb/w');
    pos.turn = parts[1] === 'b' ? 's' : 'g';
    if (parts[2] !== '-') {
      const re = /(\d*)([RBGSNLPrbgsnlp])/g;
      let m, consumed = 0;
      while ((m = re.exec(parts[2])) !== null) {
        const n = m[1] ? Number(m[1]) : 1;
        const side = (m[2] === m[2].toUpperCase()) ? 's' : 'g';
        pos.hands[side][m[2].toUpperCase()] += n;
        consumed += m[0].length;
      }
      if (consumed !== parts[2].length) throw new Error('SFEN: 持ち駒の表記が不正 ' + parts[2]);
    }
    if (!/^\d+$/.test(parts[3])) throw new Error('SFEN: 手数が数字でない');
    pos.movenum = Number(parts[3]);
    return pos;
  }

  function toSfen(pos) {
    const rows = [];
    for (let r = 1; r <= 9; r++) {
      let row = '', empty = 0;
      for (let f = 9; f >= 1; f--) {
        const p = pos.board[idx(f, r)];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        const c = p.side === 's' ? p.letter : p.letter.toLowerCase();
        row += (p.promoted ? '+' : '') + c;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let hand = '';
    for (const side of ['s', 'g']) {
      for (const letter of HAND_ORDER) {
        const n = pos.hands[side][letter];
        if (n > 0) hand += (n > 1 ? n : '') + (side === 's' ? letter : letter.toLowerCase());
      }
    }
    return rows.join('/') + ' ' + (pos.turn === 's' ? 'b' : 'w') + ' ' + (hand || '-') + ' ' + pos.movenum;
  }

  // ---------- USI着手 ----------
  const RE_MOVE = /^([1-9])([a-i])([1-9])([a-i])(\+)?$/;
  const RE_DROP = /^([RBGSNLP])\*([1-9])([a-i])$/;

  function parseMove(usi) {
    let m = RE_MOVE.exec(usi);
    if (m) {
      return { drop: null, from: { f: +m[1], r: RANKS.indexOf(m[2]) + 1 }, to: { f: +m[3], r: RANKS.indexOf(m[4]) + 1 }, promote: !!m[5] };
    }
    m = RE_DROP.exec(usi);
    if (m) return { drop: m[1], from: null, to: { f: +m[2], r: RANKS.indexOf(m[3]) + 1 }, promote: false };
    throw new Error('USI: 不正な着手表記 ' + usi);
  }

  function moveToUsi(mv) {
    if (mv.drop) return mv.drop + '*' + mv.to.f + RANKS[mv.to.r - 1];
    return '' + mv.from.f + RANKS[mv.from.r - 1] + mv.to.f + RANKS[mv.to.r - 1] + (mv.promote ? '+' : '');
  }

  // ---------- 利き・王手判定(対象マスからの逆探査) ----------
  function stepAttacks(p) {
    let base;
    if (p.promoted) {
      if (p.letter === 'B') base = HORSE_STEPS;
      else if (p.letter === 'R') base = DRAGON_STEPS;
      else base = GOLDLIKE;
    } else if (p.letter === 'G') base = GOLDLIKE;
    else base = STEPS[p.letter] || [];
    if (p.side === 'g') return base.map(([df, dr]) => [df, -dr]);
    return base;
  }
  function slideAttacks(p) {
    if (p.promoted) {
      if (p.letter === 'B') return SLIDES.B;
      if (p.letter === 'R') return SLIDES.R;
      return [];
    }
    if (p.letter === 'L') return p.side === 'g' ? [[0, 1]] : [[0, -1]];
    return SLIDES[p.letter] || [];
  }

  const EIGHT_DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  // (f,r) が side 側の駒に利かされているか
  function isAttacked(pos, f, r, side) {
    // 桂(不成)の特殊探査: side の桂が跳んで (f,r) に届く位置
    const dr = side === 's' ? 2 : -2; // 先手桂は(f±1, r+2)から(f,r)へ跳ぶ
    for (const df of [-1, 1]) {
      const ff = f + df, rr = r + dr;
      if (inBoard(ff, rr)) {
        const p = pos.board[idx(ff, rr)];
        if (p && p.side === side && p.letter === 'N' && !p.promoted) return true;
      }
    }
    // 8方向の逆探査
    for (const [dx, dy] of EIGHT_DIRS) {
      for (let k = 1; ; k++) {
        const ff = f + dx * k, rr = r + dy * k;
        if (!inBoard(ff, rr)) break;
        const p = pos.board[idx(ff, rr)];
        if (!p) continue;
        if (p.side === side) {
          const toTarget = [-dx, -dy]; // 駒→対象マスの方向
          if (k === 1 && stepAttacks(p).some(([a, b]) => a === toTarget[0] && b === toTarget[1])) return true;
          if (slideAttacks(p).some(([a, b]) => a === toTarget[0] && b === toTarget[1])) return true;
        }
        break; // 敵味方問わず駒で遮られる
      }
    }
    return false;
  }

  function kingSquare(pos, side) {
    for (let i = 0; i < 81; i++) {
      const p = pos.board[i];
      if (p && p.side === side && p.letter === 'K') return { f: (i % 9) + 1, r: Math.floor(i / 9) + 1 };
    }
    return null;
  }

  function inCheck(pos, side) {
    const k = kingSquare(pos, side);
    if (!k) return false;
    return isAttacked(pos, k.f, k.r, side === 's' ? 'g' : 's');
  }

  // ---------- 着手の適用 ----------
  function applyMove(pos, mv) {
    const np = clonePosition(pos);
    if (mv.drop) {
      np.hands[np.turn][mv.drop]--;
      np.board[idx(mv.to.f, mv.to.r)] = piece(np.turn, mv.drop, false);
    } else {
      const p = np.board[idx(mv.from.f, mv.from.r)];
      const captured = np.board[idx(mv.to.f, mv.to.r)];
      if (captured && captured.letter !== 'K') np.hands[np.turn][captured.letter]++;
      np.board[idx(mv.from.f, mv.from.r)] = null;
      np.board[idx(mv.to.f, mv.to.r)] = mv.promote ? piece(p.side, p.letter, true) : p;
    }
    np.turn = np.turn === 's' ? 'g' : 's';
    np.movenum++;
    return np;
  }

  // ---------- 移動候補(盤上の駒の到達可能マス) ----------
  function reachableSquares(pos, f, r) {
    const p = pos.board[idx(f, r)];
    if (!p) return [];
    const out = [];
    for (const [df, dr] of stepAttacks(p)) {
      const ff = f + df, rr = r + dr;
      if (!inBoard(ff, rr)) continue;
      const t = pos.board[idx(ff, rr)];
      if (!t || t.side !== p.side) out.push([ff, rr]);
    }
    for (const [df, dr] of slideAttacks(p)) {
      let ff = f + df, rr = r + dr;
      while (inBoard(ff, rr)) {
        const t = pos.board[idx(ff, rr)];
        if (!t) out.push([ff, rr]);
        else { if (t.side !== p.side) out.push([ff, rr]); break; }
        ff += df; rr += dr;
      }
    }
    return out;
  }

  // ---------- 成り・行き所・二歩の規則 ----------
  const inZone = (r, side) => side === 's' ? r <= 3 : r >= 7;
  function isDeadSquare(letter, side, r) {
    const last = side === 's' ? 1 : 9;
    if (letter === 'P' || letter === 'L') return r === last;
    if (letter === 'N') return side === 's' ? r <= 2 : r >= 8;
    return false;
  }
  function canPromote(p, fromR, toR) {
    if (p.promoted) return false;
    if (p.letter === 'G' || p.letter === 'K') return false;
    return inZone(fromR, p.side) || inZone(toR, p.side);
  }
  function mustPromote(p, toR) {
    return !p.promoted && isDeadSquare(p.letter, p.side, toR);
  }
  function hasOwnUnpromotedPawnOnFile(pos, side, f) {
    for (let r = 1; r <= 9; r++) {
      const p = pos.board[idx(f, r)];
      if (p && p.side === side && p.letter === 'P' && !p.promoted) return true;
    }
    return false;
  }

  // ---------- 合法手生成 ----------
  // uchifuzumeDepth: 打ち歩詰め判定の再帰上限。相手の応手列挙時は1減らして呼ぶ。
  function generateLegalMoves(pos, uchifuzumeDepth) {
    if (uchifuzumeDepth === undefined) uchifuzumeDepth = 2;
    const side = pos.turn;
    const moves = [];

    // 盤上の駒の移動
    for (let i = 0; i < 81; i++) {
      const p = pos.board[i];
      if (!p || p.side !== side) continue;
      const f = (i % 9) + 1, r = Math.floor(i / 9) + 1;
      for (const [tf, tr] of reachableSquares(pos, f, r)) {
        const cands = [];
        if (mustPromote(p, tr)) cands.push(true);
        else if (canPromote(p, r, tr)) { cands.push(false); cands.push(true); }
        else cands.push(false);
        for (const promo of cands) {
          const mv = { drop: null, from: { f, r }, to: { f: tf, r: tr }, promote: promo };
          if (!inCheck(applyMove(pos, mv), side)) moves.push(mv);
        }
      }
    }
    // 打ち
    for (const letter of HAND_ORDER) {
      if (pos.hands[side][letter] <= 0) continue;
      for (let f = 1; f <= 9; f++) {
        if (letter === 'P' && hasOwnUnpromotedPawnOnFile(pos, side, f)) continue; // 二歩
        for (let r = 1; r <= 9; r++) {
          if (pos.board[idx(f, r)]) continue;
          if (isDeadSquare(letter, side, r)) continue; // 行き所のない駒
          const mv = { drop: letter, from: null, to: { f, r }, promote: false };
          const np = applyMove(pos, mv);
          if (inCheck(np, side)) continue; // 自玉の安全
          // 打ち歩詰め
          if (letter === 'P' && uchifuzumeDepth > 0 && inCheck(np, np.turn)) {
            if (generateLegalMoves(np, uchifuzumeDepth - 1).length === 0) continue;
          }
          moves.push(mv);
        }
      }
    }
    return moves;
  }

  // ---------- 単一着手の判定(理由コード付き) ----------
  function validateMove(pos, usi) {
    let mv;
    try { mv = parseMove(usi); } catch (e) { return { legal: false, reason: REASON.BAD_MOVEMENT, detail: String(e.message) }; }
    const side = pos.turn;

    if (mv.drop) {
      if (pos.hands[side][mv.drop] <= 0) return { legal: false, reason: REASON.BAD_DROP };
      if (pos.board[idx(mv.to.f, mv.to.r)]) return { legal: false, reason: REASON.BAD_DROP };
      if (isDeadSquare(mv.drop, side, mv.to.r)) return { legal: false, reason: REASON.DEAD_PIECE };
      if (mv.drop === 'P' && hasOwnUnpromotedPawnOnFile(pos, side, mv.to.f)) return { legal: false, reason: REASON.NIFU };
      const np = applyMove(pos, mv);
      if (inCheck(np, side)) return { legal: false, reason: REASON.KING_IN_CHECK };
      if (mv.drop === 'P' && inCheck(np, np.turn) && generateLegalMoves(np, 1).length === 0) {
        return { legal: false, reason: REASON.UCHIFU_ZUME };
      }
      return { legal: true, reason: null };
    }

    const p = pos.board[idx(mv.from.f, mv.from.r)];
    if (!p || p.side !== side) return { legal: false, reason: REASON.BAD_MOVEMENT };
    const reach = reachableSquares(pos, mv.from.f, mv.from.r);
    if (!reach.some(([f, r]) => f === mv.to.f && r === mv.to.r)) return { legal: false, reason: REASON.BAD_MOVEMENT };
    if (mv.promote && !canPromote(p, mv.from.r, mv.to.r)) return { legal: false, reason: REASON.BAD_PROMOTION };
    if (!mv.promote && mustPromote(p, mv.to.r)) return { legal: false, reason: REASON.DEAD_PIECE };
    if (inCheck(applyMove(pos, mv), side)) return { legal: false, reason: REASON.KING_IN_CHECK };
    return { legal: true, reason: null };
  }

  // ---------- perft ----------
  function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = generateLegalMoves(pos);
    if (depth === 1) return moves.length;
    let n = 0;
    for (const mv of moves) n += perft(applyMove(pos, mv), depth - 1);
    return n;
  }

  // ---------- 1手詰: 詰ます手の全列挙 ----------
  function findAllMates(pos) {
    const mates = [];
    const opp = pos.turn === 's' ? 'g' : 's';
    for (const mv of generateLegalMoves(pos)) {
      const np = applyMove(pos, mv);
      if (!inCheck(np, opp)) continue;          // 王手でない手は詰まない
      if (generateLegalMoves(np).length === 0) mates.push(moveToUsi(mv));
    }
    return mates;
  }

  // ---------- n手以内の詰み探索(Spike 3で追加) ----------
  // 承認済み仕様:
  //  - 攻方の候補は「王手の手のみ」(詰将棋規約) / 受方は全合法手(合駒打ち含む)
  //  - mateWithin(pos, n) は「n手以内」の詰み(1手詰も n=3 で真)
  //  - 無駄合い実用ルール: 受方の合駒打ちに対し、攻方がそのマスを王手で即取り返して
  //    詰みが継続する場合、その往復(合駒+取り返し)は手数に数えない。1往復まで。
  //    ※n=3では往復が自然に3手に収まるためルールは発動しない(T7-08の設計発見)。n>=5用。

  function _existsMate(pos, plies, udagoiOK) {
    if (plies < 1) return false;
    for (const m of generateLegalMoves(pos)) {
      const np = applyMove(pos, m);
      if (!inCheck(np, np.turn)) continue;      // 王手でない手は候補外
      if (_defenderLost(np, plies, udagoiOK)) return true;
    }
    return false;
  }

  // np: 受方(np.turn)の手番。plies = この王手を含む残り手数
  function _defenderLost(np, plies, udagoiOK) {
    const dmoves = generateLegalMoves(np);
    if (dmoves.length === 0) return true;       // 応手なし = 詰み
    if (plies <= 1) return false;               // 手数切れ
    for (const dm of dmoves) {
      const nd = applyMove(np, dm);
      if (_existsMate(nd, plies - 2, udagoiOK)) continue;
      if (udagoiOK && dm.drop) {
        // 無駄合い実用ルール: 合駒を王手で取り返して詰みが継続するなら往復を手数に数えない
        let saved = false;
        for (const cm of generateLegalMoves(nd)) {
          if (cm.drop || cm.to.f !== dm.to.f || cm.to.r !== dm.to.r) continue;
          const nc = applyMove(nd, cm);
          if (!inCheck(nc, nc.turn)) continue;
          if (_defenderLost(nc, plies, false)) { saved = true; break; } // 2往復目は不可
        }
        if (saved) continue;
      }
      return false;                             // 逃れる応手が存在
    }
    return true;
  }

  function findAllMateMoves(pos, n) {
    const out = [];
    for (const m of generateLegalMoves(pos)) {
      const np = applyMove(pos, m);
      if (!inCheck(np, np.turn)) continue;
      if (_defenderLost(np, n, true)) out.push(moveToUsi(m));
    }
    return out;
  }

  function mateWithin(pos, n) { return _existsMate(pos, n, true); }

  // 出題UIの正誤判定: プレイヤーの初手が n手以内の詰みを維持するか(別解の初手も正解にする)
  function isCorrectMateMove(pos, usi, n) {
    const v = validateMove(pos, usi);
    if (!v.legal) return false;
    const np = applyMove(pos, parseMove(usi));
    if (!inCheck(np, np.turn)) return false;
    return _defenderLost(np, n, true);
  }

  return {
    BUILD: 'p1-007',
    REASON, parseSfen, toSfen, parseMove, moveToUsi,
    generateLegalMoves, validateMove, applyMove, inCheck, isAttacked, reachableSquares,
    perft, findAllMates, kingSquare,
    mateWithin, findAllMateMoves, isCorrectMateMove,
  };
});
