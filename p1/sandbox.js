/* 盤サンドボックス: ウィジェット単体をフリー対局で検証 */
(function () {
  'use strict';
  const HIRATE = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
  const logEl = document.getElementById('log');
  const logLines = [];
  function log(msg, cls) {
    const t = new Date();
    const line = `[${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}] ${msg}`;
    logLines.push(line);
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = line;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }
  window.addEventListener('error', (e) => log(`JSエラー: ${e.message} @${e.filename}:${e.lineno}`, 'warn'));
  window.addEventListener('unhandledrejection', (e) => log(`未処理Promise拒否: ${(e.reason && e.reason.message) || e.reason}`, 'warn'));
  // [診断] タップ位置の最前面要素を必ずログに出す(widgetの処理と独立して記録される)
  function desc(el) {
    if (!el) return 'null';
    const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.split(' ').slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  }
  document.addEventListener('pointerdown', (e) => {
    const front = document.elementFromPoint(e.clientX, e.clientY);
    log(`[診断] pd 最前面=${desc(front)} / target=${desc(e.target)}`);
  }, { capture: true });
  const GYOKU = {
    NIFU: '二歩', DEAD_PIECE: '行き所のない駒', UCHIFU_ZUME: '打ち歩詰め',
    KING_IN_CHECK: '王手放置/自殺手', BAD_PROMOTION: '成りの規則', BAD_MOVEMENT: '駒の動き/手番', BAD_DROP: '打ちの規則',
  };
  function refresh(w) {
    document.getElementById('sb-turn').textContent = w.getTurn() === 's' ? '☗先手' : '☖後手';
    document.getElementById('sb-state').textContent = !w.hasLegalMoves() ? (w.inCheck() ? '詰み!' : '合法手なし') : (w.inCheck() ? '王手!' : '');
  }
  let widget;
  widget = window.Hakoniwa.ShogiWidget(document.getElementById('sb-board'), {
    sfen: HIRATE,
    showBothHands: true,
    onMove(usi) { log(`着手 ${usi}`, 'ok'); refresh(widget); },
    onIllegal(reason) { log(`反則: ${GYOKU[reason] || reason}(着手されない=正常)`, 'warn'); },
    debug(msg) { log(`[widget] ${msg}`); },
  });
  refresh(widget);
  document.getElementById('sb-reset').addEventListener('click', () => { widget.setPosition(HIRATE); refresh(widget); log('初期配置に戻した', 'ok'); });
  document.getElementById('btn-copy-log').addEventListener('click', async () => {
    const text = [`盤サンドボックスログ (HTML=${window.BUILD_HTML})`, `UA: ${navigator.userAgent}`, ...logLines].join('\n');
    try { await navigator.clipboard.writeText(text); log('ログをコピーしました', 'ok'); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); log('コピー(fallback)', 'ok'); }
  });
})();
