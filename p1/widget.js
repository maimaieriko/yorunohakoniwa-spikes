/* ============================================================
   ヨルノハコニワ - 盤ウィジェット (subjects/shogi/widget.js) ブラウザ専用
   仕様(P1-b設計書§3): 9×9盤 / 駒台 / タップ2段+ドラッグ / 真の合法手ハイライト
   (反則手は選べない) / 成り選択ダイアログ(強制成りは自動) / 120ms移動アニメ /
   アニメ中入力ロック / 多点タッチ無視 / 反則タップは理由コードをonIllegalへ
   ============================================================ */
(function () {
  'use strict';
  const NS = (window.Hakoniwa = window.Hakoniwa || {});
  const RANKS = 'abcdefghi';
  const KANJI = { K: '玉', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };
  const KANJI_P = { R: '竜', B: '馬', S: '全', N: '圭', L: '杏', P: 'と' };
  const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

  NS.ShogiWidget = function (container, opts) {
    const E = window.ShogiEngine;
    let pos = E.parseSfen(opts.sfen);
    let legal = [];               // 現局面の全合法手(キャッシュ)
    let sel = null;               // {kind:'board',f,r} | {kind:'hand',letter}
    let locked = false;
    let dragging = null;          // {startX,startY,moved,fly}

    // ---- DOM構築 ----
    container.innerHTML = '';
    const wrap = el('div', 'sw-wrap');
    const handG = el('div', 'sw-hand gote');
    const boardRow = el('div', 'sw-board-row');
    const files = el('div', 'sw-files');
    const board = el('div', 'sw-board');
    const ranks = el('div', 'sw-ranks');
    const handS = el('div', 'sw-hand sente');
    const promo = el('div', 'sw-promo hidden');
    for (let f = 9; f >= 1; f--) files.appendChild(el('div', '', String(f)));
    for (let r = 1; r <= 9; r++) ranks.appendChild(el('div', '', NUMS[r - 1]));
    boardRow.append(board, ranks);
    wrap.append(handG, files, boardRow, handS, promo);
    container.appendChild(wrap);
    if (!opts.showBothHands) handG.classList.add('hidden');

    const cells = [];
    for (let r = 1; r <= 9; r++) {
      for (let f = 9; f >= 1; f--) {
        const c = el('div', 'sw-cell');
        c.dataset.f = f; c.dataset.r = r;
        board.appendChild(c);
        cells[(r - 1) * 9 + (f - 1)] = c;
      }
    }

    function el(tag, cls, text) {
      const d = document.createElement(tag);
      if (cls) d.className = cls;
      if (text !== undefined) d.textContent = text;
      return d;
    }
    const pieceChar = (p) => (p.promoted ? KANJI_P[p.letter] : (p.letter === 'K' && p.side === 'g') ? '王' : KANJI[p.letter]);

    // ---- 描画 ----
    function refreshLegal() { legal = E.generateLegalMoves(pos); }
    function targetsOf() {
      if (!sel) return [];
      if (sel.kind === 'board') return legal.filter((m) => !m.drop && m.from.f === sel.f && m.from.r === sel.r);
      return legal.filter((m) => m.drop === sel.letter);
    }
    function render() {
      const tg = targetsOf();
      for (let r = 1; r <= 9; r++) for (let f = 1; f <= 9; f++) {
        const c = cells[(r - 1) * 9 + (f - 1)];
        const p = pos.board[(r - 1) * 9 + (f - 1)];
        c.textContent = '';
        c.className = 'sw-cell';
        if (p) {
          const s = el('span', 'sw-pc' + (p.side === 'g' ? ' gote' : ''), pieceChar(p));
          c.appendChild(s);
        }
        if (sel && sel.kind === 'board' && sel.f === f && sel.r === r) c.classList.add('selected');
        if (tg.some((m) => m.to.f === f && m.to.r === r)) {
          c.classList.add('movable');
          if (p) c.classList.add('capture');
        }
      }
      renderHand(handS, 's');
      renderHand(handG, 'g');
    }
    function renderHand(elh, side) {
      elh.innerHTML = '';
      elh.appendChild(el('span', 'sw-hand-label', side === 's' ? '☗もちごま' : '☖もちごま'));
      let any = false;
      for (const letter of HAND_ORDER) {
        const n = pos.hands[side][letter];
        if (!n) continue;
        any = true;
        const b = el('div', 'sw-hand-pc' + (side === 'g' ? ' gote' : ''));
        b.appendChild(el('span', '', KANJI[letter]));
        if (n > 1) b.appendChild(el('span', 'sw-hand-n', String(n)));
        if (sel && sel.kind === 'hand' && sel.letter === letter && pos.turn === side) b.classList.add('selected');
        b.dataset.letter = letter; b.dataset.side = side;
        elh.appendChild(b);
      }
      if (!any) elh.appendChild(el('span', 'sw-hand-none', 'なし'));
    }

    // ---- 補助 ----
    function cellRect(f, r) { return cells[(r - 1) * 9 + (f - 1)].getBoundingClientRect(); }
    function cellFromPoint(x, y) {
      const b = board.getBoundingClientRect();
      if (x < b.left || x >= b.right || y < b.top || y >= b.bottom) return null;
      const col = Math.floor((x - b.left) / (b.width / 9));   // 0=9筋
      const row = Math.floor((y - b.top) / (b.height / 9));   // 0=一段
      return { f: 9 - col, r: row + 1 };
    }
    function reject(f, r) {
      const c = cells[(r - 1) * 9 + (f - 1)];
      c.classList.remove('reject'); void c.offsetWidth; c.classList.add('reject');
    }
    function illegalReason(target) {
      // 選択中の駒/持ち駒から target への手が「なぜダメか」を理由コードで返す
      let usi;
      if (sel.kind === 'hand') usi = `${sel.letter}*${target.f}${RANKS[target.r - 1]}`;
      else usi = `${sel.f}${RANKS[sel.r - 1]}${target.f}${RANKS[target.r - 1]}`;
      const v = E.validateMove(pos, usi);
      return v.legal ? null : v.reason; // 成り強制のみ非合法のケースはハイライト済みのため通常ここへ来ない
    }

    // ---- 成り選択 ----
    function askPromotion(mvPlain, mvPromo) {
      return new Promise((resolve) => {
        if (opts.debug) opts.debug(`成り選択 表示 pending保持: 成=${E.moveToUsi(mvPromo)} / 不成=${E.moveToUsi(mvPlain)}`);
        promo.innerHTML = '';
        promo.classList.remove('hidden');
        const p = pos.board[(mvPlain.from.r - 1) * 9 + (mvPlain.from.f - 1)];
        promo.appendChild(el('div', 'sw-promo-q', 'なる?'));
        const row = el('div', 'sw-promo-row');
        const b1 = el('button', 'sw-promo-btn', `${KANJI_P[p.letter]} なる`);
        const b2 = el('button', 'sw-promo-btn sub', `${KANJI[p.letter]} ならない`);
        // iOS Safari対策: clickを待たずpointerupで確定(clickはフォールバック)。二重発火はdoneで防ぐ
        let done = false;
        const choose = (mv, label) => (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (done) return;
          done = true;
          if (opts.debug) opts.debug(`成り選択 確定: ${label} promote=${mv.promote} usi=${E.moveToUsi(mv)}`);
          promo.classList.add('hidden');
          resolve(mv);
        };
        const h1 = choose(mvPromo, 'なる'), h2 = choose(mvPlain, 'ならない');
        b1.addEventListener('pointerup', h1); b1.addEventListener('click', h1);
        b2.addEventListener('pointerup', h2); b2.addEventListener('click', h2);
        row.append(b1, b2);
        promo.appendChild(row);
      });
    }

    // ---- 着手コミット(アニメ→適用→通知) ----
    async function commit(mv, skipAnim) {
      locked = true;
      const usi = E.moveToUsi(mv);
      if (!skipAnim) await animateMove(mv);
      pos = E.applyMove(pos, mv);
      sel = null;
      refreshLegal();
      render();
      locked = false;
      opts.onMove && opts.onMove(usi);
    }
    function animateMove(mv) {
      return new Promise((resolve) => {
        const to = cellRect(mv.to.f, mv.to.r);
        const wrapRect = wrap.getBoundingClientRect();
        let fromRect, ch;
        if (mv.drop) {
          fromRect = (pos.turn === 's' ? handS : handG).getBoundingClientRect();
          ch = KANJI[mv.drop];
        } else {
          fromRect = cellRect(mv.from.f, mv.from.r);
          const p = pos.board[(mv.from.r - 1) * 9 + (mv.from.f - 1)];
          ch = mv.promote ? KANJI_P[p.letter] : pieceChar(p);
          cells[(mv.from.r - 1) * 9 + (mv.from.f - 1)].textContent = '';
        }
        const fly = el('div', 'sw-fly' + (pos.turn === 'g' ? ' gote' : ''), ch);
        fly.style.left = (fromRect.left - wrapRect.left) + 'px';
        fly.style.top = (fromRect.top - wrapRect.top) + 'px';
        wrap.appendChild(fly);
        requestAnimationFrame(() => {
          fly.style.transform = `translate(${to.left - fromRect.left}px, ${to.top - fromRect.top}px)`;
        });
        setTimeout(() => { fly.remove(); resolve(); }, 140); // 120ms + 余裕
      });
    }

    // ---- 着手試行(タップ/ドラッグ共通) ----
    function tryMoveTo(target) {
      const tg = targetsOf().filter((m) => m.to.f === target.f && m.to.r === target.r);
      if (tg.length === 0) {
        const p = pos.board[(target.r - 1) * 9 + (target.f - 1)];
        if (p && p.side === pos.turn) { // 選び直し
          sel = { kind: 'board', f: target.f, r: target.r };
          render();
          return;
        }
        const reason = illegalReason(target);
        if (reason && opts.onIllegal) opts.onIllegal(reason);
        reject(target.f, target.r);
        return;
      }
      if (tg.length === 2) { // 成・不成の選択
        const plain = tg.find((m) => !m.promote), pr = tg.find((m) => m.promote);
        askPromotion(plain, pr).then((mv) => commit(mv));
      } else {
        commit(tg[0]);
      }
    }

    // ---- 入力(Pointer Events一本化・多点無視) ----
    wrap.addEventListener('pointerdown', (e) => {
      if (opts.debug) {
        const c0 = e.target.closest('.sw-cell');
        opts.debug(`pd target=${e.target.tagName}.${(typeof e.target.className === 'string' ? e.target.className : '')}` +
          ` sq=${c0 ? c0.dataset.f + ',' + c0.dataset.r : 'なし'} locked=${locked}` +
          ` sel=${sel ? (sel.kind === 'hand' ? '持駒' + sel.letter : sel.f + ',' + sel.r) : 'なし'}`);
      }
      if (e.target.closest('.sw-promo')) return; // p1-005: ダイアログ内は委譲処理もpreventDefaultもしない
      if (!e.isPrimary || locked) return;
      e.preventDefault();
      const handPc = e.target.closest('.sw-hand-pc');
      if (handPc) {
        if (handPc.dataset.side !== pos.turn) { opts.onIllegal && opts.onIllegal('BAD_MOVEMENT'); return; }
        sel = (sel && sel.kind === 'hand' && sel.letter === handPc.dataset.letter) ? null : { kind: 'hand', letter: handPc.dataset.letter };
        render();
        return;
      }
      const cell = e.target.closest('.sw-cell');
      if (!cell) return;
      const f = Number(cell.dataset.f), r = Number(cell.dataset.r);
      const p = pos.board[(r - 1) * 9 + (f - 1)];
      if (!sel) {
        if (!p) return;
        if (p.side !== pos.turn) { opts.onIllegal && opts.onIllegal('BAD_MOVEMENT'); reject(f, r); return; }
        sel = { kind: 'board', f, r };
        dragging = { startX: e.clientX, startY: e.clientY, moved: false };
        wrap.setPointerCapture(e.pointerId);
        render();
        return;
      }
      if (sel.kind === 'board' && sel.f === f && sel.r === r) { sel = null; render(); return; } // 解除
      // 自駒からのドラッグ開始も許可(選び直し)
      if (p && p.side === pos.turn && !targetsOf().some((m) => m.to.f === f && m.to.r === r)) {
        sel = { kind: 'board', f, r };
        dragging = { startX: e.clientX, startY: e.clientY, moved: false };
        wrap.setPointerCapture(e.pointerId);
        render();
        return;
      }
      tryMoveTo({ f, r });
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!dragging || !e.isPrimary || locked) return;
      if (!dragging.moved && Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) > 10) {
        dragging.moved = true;
        const p = pos.board[(sel.r - 1) * 9 + (sel.f - 1)];
        dragging.fly = el('div', 'sw-fly drag' + (p.side === 'g' ? ' gote' : ''), pieceChar(p));
        wrap.appendChild(dragging.fly);
      }
      if (dragging.fly) {
        const wr = wrap.getBoundingClientRect();
        dragging.fly.style.left = (e.clientX - wr.left - 20) + 'px';
        dragging.fly.style.top = (e.clientY - wr.top - 26) + 'px';
      }
    });
    wrap.addEventListener('pointerup', (e) => {
      if (!dragging || !e.isPrimary) return;
      const d = dragging; dragging = null;
      if (d.fly) d.fly.remove();
      if (!d.moved || locked) return;              // ドラッグでなければタップ処理に任せる
      const target = cellFromPoint(e.clientX, e.clientY);
      if (!target) { render(); return; }           // 盤外で離した→選択は維持
      if (sel && sel.kind === 'board' && target.f === sel.f && target.r === sel.r) { render(); return; }
      const tg = targetsOf().filter((m) => m.to.f === target.f && m.to.r === target.r);
      if (tg.length === 2) { const plain = tg.find((m) => !m.promote), pr = tg.find((m) => m.promote); askPromotion(plain, pr).then((mv) => commit(mv, true)); }
      else if (tg.length === 1) commit(tg[0], true);
      else tryMoveTo(target);
    });
    wrap.addEventListener('pointercancel', () => { if (dragging && dragging.fly) dragging.fly.remove(); dragging = null; });
    wrap.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- 公開API ----
    refreshLegal();
    render();
    return {
      setPosition(sfen) { pos = E.parseSfen(sfen); sel = null; locked = false; refreshLegal(); render(); },
      getSfen() { return E.toSfen(pos); },
      getTurn() { return pos.turn; },
      hasLegalMoves() { return legal.length > 0; },
      inCheck() { return E.inCheck(pos, pos.turn); },
    };
  };
})();
